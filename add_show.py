import requests
import spacy
from spacytextblob.spacytextblob import SpacyTextBlob
from bs4 import BeautifulSoup
from tqdm.auto import tqdm
import json
import os
import re as regex
from collections import Counter, OrderedDict
from pathlib import Path

from util.constants import PARENT_DIR

def add_show(show, show_name):
    ### SETUP
    SHOW_DIR = f'{PARENT_DIR}/{show}'
    if os.path.isdir(SHOW_DIR):
        print(f'Attempted to import show {show_name} but it already exists! To reimport, delete the show directory ({SHOW_DIR}) and try again.')
        return
    Path(SHOW_DIR).mkdir(exist_ok=True)
    Path(f'{SHOW_DIR}/meta').mkdir(exist_ok=True)
    Path(f'{SHOW_DIR}/raw').mkdir(exist_ok=True)

    print(f'Importing {show_name}...')

    ### Get a list of all pages for the show

    topicRegex = regex.compile(r"t=(\d+)")

    url = 'https://transcripts.foreverdreaming.org/viewforum.php?f=' + str(show)
    response = requests.get(url)

    soup = BeautifulSoup(response.text, 'html.parser')

    title = soup.find('h2', class_='forum-title').text
    with open(f'{SHOW_DIR}/meta/title.txt', 'w') as file:
        file.write(title)

    pageCount = 1
    for a in soup.find('div', class_='pagination').find_all('a'):
        if a.text.isdigit() and int(a.text) > pageCount:
            pageCount = int(a.text)

    pages = []

    for i in tqdm(range(pageCount), desc=f'[1/4] Scraping {title}'):
        url = 'https://transcripts.foreverdreaming.org/viewforum.php?f=' + str(show) + '&start=' + str(i * 78)
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        for link in soup.find_all('a'):
            if link.get('href') and 'viewtopic.php' in link.get('href'):
                search = topicRegex.search(link.get('href'))
                if (search):
                    pages.append(search.group(1))

    pages = list(set(pages))

    if '32146' in pages:
        pages.remove('32146')

    pages = list(map(lambda x: 'https://transcripts.foreverdreaming.org/viewtopic.php?t=' + x, pages))

    ### Download all pages

    for page in tqdm(pages, desc='[2/4] Downloading pages'):
        response = requests.get(page)
        with open(f'{SHOW_DIR}/raw/{page.split("=")[1]}.html', 'w', encoding='utf-8') as f:
            f.write(response.text)

    ## Format pages

    pages = os.listdir(f'{SHOW_DIR}/raw')

    with open("util/uncensor.json") as f:
        uncensor = json.load(f)

    def uncensor_line(line):
        for word in uncensor.keys():
            line = line.replace(word, uncensor[word])
        return line

    show_map = {}

    for page in tqdm(pages, desc='[3/4] Formatting pages'):
        with open(f'{SHOW_DIR}/raw/{page}', 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
            title = soup.find('h2', class_='topic-title').text
            try:
                season = title.split('x')[0]
                episode = title.split('x')[1].split(' ')[0]
            except:
                season = "other"
                episode = title
            if not show_map.get(season):
                show_map[season] = {}
            show_map[season][f'{episode}.txt'] = title
            path = f"{SHOW_DIR}/formatted/{season}"
            Path(path).mkdir(exist_ok=True, parents=True)
            content = soup.find('div', class_='content')
            text = content.text
            if '*' in title:
                title = uncensor_line(title)
            formatted_text = '\n'.join([uncensor_line(line) for line in text.split('\n')])
            with open(f'{path}/{episode}.txt', 'w', encoding='utf-8') as f:
                f.write(f"{title}\n{formatted_text}")

    with open(f'{SHOW_DIR}/meta/map.json', 'w', encoding='utf-8') as f:
            json.dump(show_map, f)

    ### Analysis

    def get_text_from_episode(season, episode):
        episode_path = f'{SHOW_DIR}/formatted/{season}/{episode}'
        with open(episode_path, 'r', encoding='utf-8') as f:
            return '\n'.join(f.readlines()[1:])


    def save_frequency_to_file(path, analysis):
        save_path = Path(f'{SHOW_DIR}/analysis/word_frequency/{path}')
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, 'w', encoding='utf-8') as f:
            for word, freq in Counter(analysis).most_common():
                f.write(f'{word}: {freq}\n')

    def save_order_to_file(path, analysis):
        save_path = Path(f'{SHOW_DIR}/analysis/word_order/{path}')
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(analysis))

    def save_sentiment_to_file(analysis):
        save_path = Path(f'{SHOW_DIR}/analysis/sentiment.txt')
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, 'w', encoding='utf-8') as f:
            for episode, sentiment in analysis.items():
                f.write(f'{episode}: {sentiment}\n')

    def remove_duplicates(analysis):
        return list(OrderedDict.fromkeys(analysis))

    nlp = spacy.load('en_core_web_sm')
    nlp.add_pipe('spacytextblob')

    def complete_analysis():
        show_frequency = {}
        show_order = []
        show_sentiment = {}
        show_path = f'{SHOW_DIR}/formatted'
        seasons = os.listdir(show_path)
        with tqdm(total=len(pages), desc="[4/4] Analyzing Show") as pbar:
            for season in seasons:
                season_frequency = {}
                season_order = []
                season_path = f'{show_path}/{season}'
                episodes = os.listdir(season_path)
                for episode in episodes:
                    text = get_text_from_episode(season, episode)
                    doc = nlp(text)
                    tokens = [token for token in doc if token.is_alpha and not token.is_stop]
                    words = [f'{token.lemma_.lower()}_{token.pos_}' for token in tokens]
                    word_freq = Counter(words)
                    save_frequency_to_file(f'episode/{season}/{episode}', words)
                    for word in word_freq:
                        if word in season_frequency:
                            season_frequency[word] += word_freq[word]
                        else:
                            season_frequency[word] = word_freq[word]
                    word_order = remove_duplicates(words)
                    save_order_to_file(f'episode/{season}/{episode}', word_order)
                    season_order += [word for word in word_order if word not in season_order]
                    polarity = doc._.blob.polarity
                    subjectivity = doc._.blob.subjectivity
                    show_sentiment[f'{season}x{episode}'] = f'{round(polarity, 3)} {round(subjectivity, 3)}'
                    pbar.update()
                save_frequency_to_file(f'season/{season}.txt', season_frequency)
                for word in season_frequency:
                    if word in show_frequency:
                        show_frequency[word] += season_frequency[word]
                    else:
                        show_frequency[word] = season_frequency[word]
                save_order_to_file(f'season/{season}.txt', season_order)
                show_order += [word for word in season_order if word not in show_order]
            save_frequency_to_file('show.txt', show_frequency)
            save_order_to_file('show.txt', show_order)
            save_sentiment_to_file(show_sentiment)
    complete_analysis()
    print(f'Imported {show_name}!')
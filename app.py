import base64
import csv
import io
import json
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import os
import webbrowser
from bs4 import BeautifulSoup
from collections import Counter, OrderedDict
from flask import Flask, render_template, request, jsonify
from pandas import DataFrame as df
from pathlib import Path
import re as regex
import requests
from tqdm.auto import tqdm
import spacy
from spacytextblob.spacytextblob import SpacyTextBlob
from wordcloud import WordCloud

matplotlib.use('Agg')
app = Flask(__name__)
PARENT_DIR = 'forever_dreaming'

if not os.path.isdir(PARENT_DIR):
    os.mkdir(PARENT_DIR)

### ENDPOINTS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/read')
def read_file():
    path = request.args.get('path')
    try:
        with open(f'{PARENT_DIR}/{path}', 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify(content)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/forums')
def list_forums():
    with open('util/forums.json', encoding='utf-8') as f:
        forums = json.load(f)
    return jsonify(forums)

@app.route('/api/showmap')
def map_files():
    show_map = {}
    shows = os.listdir(PARENT_DIR)
    for show in shows:
        with open(f'{PARENT_DIR}/{show}/meta/map.json') as f:
            show_map[show] = json.load(f)
    return jsonify(show_map)

@app.route('/api/showtitles')
def show_titles():
    shows = os.listdir(PARENT_DIR)
    titles = {}
    for show in shows:
        with open(f'{PARENT_DIR}/{show}/meta/title.txt') as f:
            titles[show] = f.read()
    return jsonify(titles)

@app.route('/api/heatmap')
def heatmap():
    words = request.args.get('words').split(',')
    show = request.args.get('show')
    season = request.args.get('season') or None
    smooth = request.args.get('smooth') == 'true'
    try:
        image = generate_heatmap(words, show, season=season, smooth_data=smooth)
        return image
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400
    
@app.route('/api/wordcloud')
def wordcloud():
    width = request.args.get('width')
    height = request.args.get('height')
    show = request.args.get('show')
    season = request.args.get('season') or None
    episode = request.args.get('episode') or None
    filter = request.args.get('filter') or None
    try:
        image = generate_wordcloud(width, height, show, season=season, episode=episode, part=filter)
        return image
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400

@app.route('/api/add_show')
def import_show():
    show = request.args.get('show')
    name = request.args.get('name')
    try:
        add_show(show, name)
        return jsonify({'success': True})
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400

### VISUALIZATION

frequency_cache = {}

def load_frequency(show, season = None, episode = None):
    frequency = {}
    if episode:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/episode/{season}/{episode}'
    elif season:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/season/{season}.txt'
    else:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/show.txt'
    with open(file, 'r') as f:
        for line in f:
            word, freq = line.split(": ")
            frequency[word] = int(freq)
    return frequency

def get_name_of_show(show):
    with open(f'{PARENT_DIR}/{show}/meta/title.txt', 'r', encoding='utf-8') as f:
        return f.readline().strip()

# this code is modified from the code found at:
#  https://github.com/natebrix/proust/blob/main/proust_names.py
def name_frequency_plot(df, starts=None, show=None, season=None, transform=None, color_map='Blues', norm=None, stretch_factor=1):
    xy = np.array(df)
    if transform:
        xy[:, 1:] = transform(xy[:, 1:]) 
    row_count = xy.shape[1] - 1
    plt.rcParams["figure.figsize"] = (7.5, row_count * stretch_factor)
    height_ratios = [stretch_factor] * row_count
    
    # thanks stackoverflow:
    #  https://stackoverflow.com/questions/45841786/creating-a-1d-heat-map-from-a-line-graph
    fig, axs = plt.subplots(nrows=row_count, sharex=True, gridspec_kw={'height_ratios': height_ratios}, constrained_layout=True)

    if row_count == 1:
        axs = [axs]

    x = xy[:, 0]
    extent = [x[0]-(x[1]-x[0])/2., x[-1]+(x[1]-x[0])/2.,0,1]
    for ax_i, ax in enumerate(axs):
        i = ax_i + 1
        y = xy[:, i]
        ax.imshow(y[np.newaxis,:], cmap=color_map, aspect="auto", extent=extent, norm=norm)
        ax.set_yticks([])
        ax.set_ylabel(format_word(df.columns[i]))
        ax.set_xlim(extent[0], extent[1])
        if starts:
            ax.set_xticks(starts)
            ax.set_xticklabels(generate_season_labels(starts))
        if ax_i == 0:
            ax.set_title('Frequency of words in ' + (get_name_of_show(show) if show else 'show') + (' Season ' + str(int(season)) if season and int(season) > -1 else '') + ' by episode')
        if ax_i == len(axs) - 1:
            ax.set_xlabel('Season' if starts else 'Episode')
    # plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    plt.close(fig)
    return base64.b64encode(buf.read())

def smooth_ref_count(rc, window=3):
    rcs = rc.rolling(window).mean().fillna(rc) 
    rcs['episode'] = rc['episode']
    return rcs

def generate_season_labels(starts):
    labels = []
    for i in range(len(starts)):
        labels.append(str(i + 1))
    return labels

def format_word(str):
    try:
        word, pos = str.split('_')
        if pos == 'PROPN':
            return word.capitalize()
        return word
    except:
        print(str)

def get_ref_count_by_episode(words, show, season=None, skipOtherSeasons=False):
    if (season):
        key = f'{show}_{season}'
    else:
        key = show
    # if key in frequency_cache:
    #     return frequency_cache[key]
    ref_count = {}
    count = 0
    starts = []
    if season:
        seasons = [season]
    else:
        seasons = os.listdir(f'{PARENT_DIR}/{show}/analysis/word_frequency/episode')
        if skipOtherSeasons:
            seasons = [season for season in seasons if season.isdigit() and int(season) >= 1]
    for season in seasons:
        starts.append(count)
        for episode in os.listdir(f'{PARENT_DIR}/{show}/analysis/word_frequency/episode/{season}'):
            count += 1
            episode = episode.split(': ')[0]
            frequency = load_frequency(show, season = season, episode = episode)
            ref_count[count] = {word: frequency.get(word, 0) for word in words}
    frequency_cache[key] = ref_count, starts
    return ref_count, starts

def get_ref_count_by_episode_df(words, show, season=None):
    ref_count, starts = get_ref_count_by_episode(words, show, season=season, skipOtherSeasons=True)
    data_frame = df(ref_count).T
    data_frame.insert(0, 'episode', data_frame.index)
    data_frame = data_frame.reset_index(drop=True)
    return data_frame, starts

def generate_heatmap(words, show, season=None, smooth_data=True):
    ref_count, starts = get_ref_count_by_episode_df(words, show, season)
    if (smooth_data):
        ref_count = smooth_ref_count(ref_count)
    color_map = 'Greens' if season else 'Blues'
    if len(starts) == 1 and season is None:
        season = '-1'
    starts = None if season else starts
    plot = name_frequency_plot(ref_count, starts=starts, show=show, season=season, color_map=color_map, norm=None, stretch_factor=1.5)
    return plot

def generate_wordcloud(width, height, show, season=None, episode=None, part=None):
    frequency = load_frequency(show, season, episode)
    if part:
        frequency = {word: frequency[word] for word in frequency if part in word}
    max_words = 200
    if len(frequency) > max_words:
        frequency = {k: frequency[k] for k in list(frequency.keys())[:max_words]}
    wordcloud = WordCloud(width = int(width), height = int(height),
                colormap= 'plasma' if episode else 'viridis' if season else 'magma',
                background_color = 'white',
                stopwords = None,
                min_font_size = 10).generate_from_frequencies({format_word(word): frequency[word] for word in frequency})
    buf = io.BytesIO()
    wordcloud.to_image().save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read())

### IMPORT

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
            show_map[season][episode] = title
            path = f"{SHOW_DIR}/formatted/{season}"
            Path(path).mkdir(exist_ok=True, parents=True)
            content = soup.find('div', class_='content')
            text = content.text
            if '*' in title:
                title = uncensor_line(title)
            formatted_text = '\n'.join([uncensor_line(line) for line in text.split('\n')])
            with open(f'{path}/{episode}.txt', 'w', encoding='utf-8') as f:
                f.write(f"{title}\n{formatted_text}")

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

if __name__ == '__main__':
    webbrowser.open('http://localhost:5000')
    Flask.run(app)
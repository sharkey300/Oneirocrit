import base64
import io
import os
import matplotlib.pyplot as plt
import numpy as np
from pandas import DataFrame as df
from wordcloud import WordCloud
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from util.constants import PARENT_DIR

frequency_cache = {}

@lru_cache(maxsize=None)
def load_frequency(show, season=None, episode=None):
    frequency = {}
    if episode:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/episode/{season}/{episode}'
    elif season:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/season/{season}.txt'
    else:
        file = f'{PARENT_DIR}/{show}/analysis/word_frequency/show.txt'
    with open(file, 'r', encoding='utf-8') as f:
        for line in f:
            word, freq = line.split(": ")
            frequency[word] = int(freq)
    return frequency

def get_name_of_show(show):
    with open(f'{PARENT_DIR}/{show}/meta/title.txt', 'r', encoding='utf-8') as f:
        return f.readline().strip()

def name_frequency_plot(df, starts=None, show=None, season=None, transform=None, color_map='Blues', norm=None, stretch_factor=1):
    xy = np.array(df)
    if transform:
        xy[:, 1:] = transform(xy[:, 1:]) 
    row_count = xy.shape[1] - 1
    plt.rcParams["figure.figsize"] = (8, row_count * stretch_factor)
    height_ratios = [stretch_factor] * row_count
    
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
    return [str(i + 1) for i in range(len(starts))]

def format_word(word):
    try:
        word, pos = word.split('_')
        if pos == 'PROPN':
            return word.capitalize()
        return word
    except:
        return word

def get_ref_count_by_episode(words, show, season=None, skipOtherSeasons=False):
    ref_count = {}
    count = 0
    starts = []
    if season:
        seasons = [season]
    else:
        seasons = os.listdir(f'{PARENT_DIR}/{show}/analysis/word_frequency/episode')
        if skipOtherSeasons:
            seasons = [season for season in seasons if season.isdigit() and int(season) >= 1]

    def process_episode(season, episode, episode_index):
        episode = episode.split(': ')[0]
        word_keys = [f'{show}_{season}_{episode}_{word}' for word in words]
        all_cached = all(word_key in frequency_cache for word_key in word_keys)
        if all_cached:
            return episode_index, {word: frequency_cache[word_key] for word, word_key in zip(words, word_keys)}
        else:
            frequency = load_frequency(show, season=season, episode=episode)
            result = {word: frequency.get(word, 0) for word in words}
            for word, word_key in zip(words, word_keys):
                frequency_cache[word_key] = frequency.get(word, 0)
            return episode_index, result

    with ThreadPoolExecutor() as executor:
        futures = []
        for season in seasons:
            starts.append(count + 1)
            episodes = os.listdir(f'{PARENT_DIR}/{show}/analysis/word_frequency/episode/{season}')
            for episode in episodes:
                count += 1
                futures.append(executor.submit(process_episode, season, episode, count))
        for future in futures:
            episode_index, result = future.result()
            ref_count[episode_index] = result

    return ref_count, starts

def get_ref_count_by_episode_df(words, show, season=None):
    ref_count, starts = get_ref_count_by_episode(words, show, season=season, skipOtherSeasons=True)
    data_frame = df(ref_count).T
    data_frame.insert(0, 'episode', data_frame.index)
    data_frame = data_frame.reset_index(drop=True)
    return data_frame, starts

def generate_heatmap(words, show, season=None, smooth_data=True):
    ref_count, starts = get_ref_count_by_episode_df(words, show, season)
    if smooth_data:
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
    wordcloud = WordCloud(width=int(width), height=int(height),
                          colormap='plasma' if episode else 'viridis' if season else 'magma',
                          background_color='white',
                          stopwords=None,
                          min_font_size=10).generate_from_frequencies({format_word(word): frequency[word] for word in frequency})
    buf = io.BytesIO()
    wordcloud.to_image().save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read())
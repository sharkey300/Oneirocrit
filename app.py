import json
import matplotlib
import os
import webbrowser
from flask import Flask, render_template, request, jsonify
from flask_caching import Cache

from util.constants import PARENT_DIR
from add_show import add_show
from visualize import generate_heatmap, generate_line_plot, generate_wordcloud, generate_sentiment

matplotlib.use('Agg')
app = Flask(__name__)
app.json.ensure_ascii = False

cache = Cache(app, config={
    'CACHE_TYPE': 'simple',
    'CACHE_THRESHOLD': 50
})

if not os.path.isdir(PARENT_DIR):
    os.mkdir(PARENT_DIR)

### ENDPOINTS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/read')
@cache.cached(timeout=300, query_string=True)
def read_file():
    path = request.args.get('path')
    path = path.replace('..', '').replace('//', '/').replace('\\', '/').lstrip('/')
    try:
        with open(f'{PARENT_DIR}/{path}', 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify(content)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/forums')
@cache.cached(timeout=86400)
def list_forums():
    with open('util/forums.json', encoding='utf-8') as f:
        forums = json.load(f)
    return jsonify(forums)

@app.route('/api/showinfo')
@cache.memoize(timeout=86400)
def show_info():
    shows = os.listdir(PARENT_DIR)
    response = {
        'maps': {},
        'titles': {},
        'ids': {}
    }
    for show in shows:
        with open(f'{PARENT_DIR}/{show}/meta/map.json', encoding='utf-8') as f:
            response.get('maps')[show] = json.load(f)
        with open(f'{PARENT_DIR}/{show}/meta/title.txt', encoding='utf-8') as f:
            response.get('titles')[show] = f.read()
        with open(f'{PARENT_DIR}/{show}/meta/ids.json', encoding='utf-8') as f:
            response.get('ids')[show] = json.load(f)
    return jsonify(response)

@app.route('/api/heatmap')
@cache.cached(timeout=300, query_string=True)
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

@app.route('/api/lineplot')
@cache.cached(timeout=300, query_string=True)
def lineplot():
    words = request.args.get('words').split(',')
    show = request.args.get('show')
    season = request.args.get('season') or None
    smooth = request.args.get('smooth') == 'true'
    try:
        image = generate_line_plot(words, show, season=season, smooth_data=smooth)
        return image
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400
    
@app.route('/api/wordcloud')
@cache.cached(timeout=300, query_string=True)
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
    
@app.route('/api/sentiment')
@cache.cached(timeout=300, query_string=True)
def sentiment():
    show = request.args.get('show')
    season = request.args.get('season') or None
    try:
        image = generate_sentiment(show, filterSeason=season)
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
        cache.delete_memoized(show_info)
        return jsonify({'success': True})
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    webbrowser.open('http://localhost:5000')
    Flask.run(app)
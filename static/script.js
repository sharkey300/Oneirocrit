const nf = new Intl.NumberFormat()

async function readFile(path) {
    try {
        const response = await fetch(`/api/read?path=${encodeURIComponent(path)}`)
        let text = await response.text()
        text = text.slice(1, -2) // Remove wrapped quotes
        text = text.replace(/\\'/g, '\'') // Replace escaped single quotes
        text = text.replace(/\\"/g, '\"') // Replace escaped double quotes
        text = text.replace(/\\n/g, '\n') // Replace escaped newlines
        return text
    } catch (err) {
        console.error('Error reading file:', err)
    }
}

async function getJSONfromAPI(endpoint) {
    try {
        const response = await fetch('/api/' + endpoint)
        const json = await response.json()
        return json
    } catch (err) {
        console.error('Error fetching JSON:', err)
    }
}

function clearNav() {
    while (nav.firstChild) {
        nav.removeChild(nav.firstChild)
    }
}

function getShowTitle(show) {
    return showTitles[show] || show
}

function getSeasonTitle(season) {
    if (season === 'S') return 'Specials'
    if (season === 'other') return 'Other'
    if (isNaN(season)) return season
    return `Season ${Number.parseInt(season)}`
}

function getEpisodeTitle(episode) {
    episode = episode.split('.txt')[0]
    return (isNaN(episode)) ? episode : `Episode ${Number.parseInt(episode)}`
}

function getAiredRange(show) {
    const foundShow = forums.find(el => el.id === show)
    if (!foundShow) return 'Unknown (Show not found)'
    if (!foundShow.range) return 'Unknown (Range not found)'
    return foundShow.range
}

function displayAiredRange(show = null) {
    const range = show ? getAiredRange(show) : ''
    const navContent = document.querySelector('.nav-content')
    navContent.dataset.range = range
}

const BackgroundState = {
    'HOME': 'lightyellow',
    'SHOW': 'lightblue',
    'SEASON': 'lightgreen',
    'EPISODE': 'lightcoral'
}

function setBackgroundColor(color) {
    document.body.style.backgroundColor = color
}

function addPathBar(show = null, season = null, episode = null) {
    const pathBar = document.querySelector('.path-bar')
    while (pathBar.firstChild) {
        pathBar.removeChild(pathBar.firstChild)
    }
    const homeItem = document.createElement('span')
    homeItem.className = 'path-home'
    homeItem.textContent = 'Home'
    homeItem.addEventListener('click', navigateOverview)
    pathBar.appendChild(homeItem)
    if (show) {
        pathBar.appendChild(document.createTextNode(' > '))
        const showItem = document.createElement('span')
        showItem.className = 'path-show'
        showItem.textContent = getShowTitle(show)
        showItem.title = show
        showItem.addEventListener('click', () => navigateShow(show))
        pathBar.appendChild(showItem)
    }
    if (season) {
        pathBar.appendChild(document.createTextNode(' > '))
        const seasonItem = document.createElement('span')
        seasonItem.className = 'path-season'
        seasonItem.textContent = getSeasonTitle(season)
        seasonItem.title = season
        seasonItem.addEventListener('click', () => navigateSeason(show, season))
        pathBar.appendChild(seasonItem)
    }
    if (episode) {
        pathBar.appendChild(document.createTextNode(' > '))
        const episodeItem = document.createElement('span')
        episodeItem.className = 'path-episode'
        episodeItem.textContent = getEpisodeTitle(episode)
        episodeItem.title = episode
        episodeItem.addEventListener('click', () => navigateEpisode(show, season, episode))
        pathBar.appendChild(episodeItem)
    }
}

function countEpisodes(show, season = null) {
    let count = 0
    if (season) {
        const episodes = Object.keys(showMap[show][season])
        count = episodes.length
    } else {
        const seasons = Object.keys(showMap[show])
        seasons.forEach((season) => {
            const episodes = Object.keys(showMap[show][season])
            count += episodes.length
        })
    }
    return count
}

function navigateOverview() {
    clearNav()
    addPathBar()
    const shows = Object.keys(showMap)
    const showList = document.createElement('ul')
    shows.forEach((show) => {
        const showItem = document.createElement('li')
        showItem.textContent = getShowTitle(show)
        const episodeCount = document.createElement('span')
        const count = countEpisodes(show)
        showItem.dataset.episodes = count
        episodeCount.textContent = `${nf.format(count)} Episode${(count === 1) ? '' : 's'}`
        episodeCount.className = 'episode-count right'
        showItem.appendChild(episodeCount)
        showItem.addEventListener('click', () => navigateShow(show))
        showList.appendChild(showItem)
    })
    nav.dataset.mode = 'overview'
    nav.appendChild(showList)
    displayAiredRange()
    setBackgroundColor(BackgroundState.HOME)
    updateAnalysisDisplay()
}

function navigateShow(show) {
    clearNav()
    addPathBar(show)
    const seasons = Object.keys(showMap[show]).sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
    const seasonList = document.createElement('ul')
    seasons.forEach((season) => {
        const seasonItem = document.createElement('li')
        seasonItem.textContent = getSeasonTitle(season)
        const episodeCount = document.createElement('span')
        const count = countEpisodes(show, season)
        episodeCount.textContent = `${nf.format(count)} Episode${(count === 1) ? '' : 's'}`
        episodeCount.className = 'episode-count right'
        seasonItem.appendChild(episodeCount)
        seasonItem.addEventListener('click', () => navigateSeason(show, season))
        seasonList.appendChild(seasonItem)
    })
    nav.dataset.mode = 'show'
    nav.appendChild(seasonList)
    displayAiredRange(show)
    setBackgroundColor(BackgroundState.SHOW)
    updateAnalysisDisplay(show)
}

function navigateSeason(show, season) {
    clearNav()
    addPathBar(show, season)
    const episodes = Object.keys(showMap[show][season])
    const episodeList = document.createElement('ul')
    episodes.forEach((episode) => {
        let title = showMap[show][season][episode]
        if (!title) title = episode
        if (title.indexOf(' - ') !== -1) {
            const number = Number.parseInt(episode.split('.txt')[0])
            const parts = title.split(' - ')
            parts.shift()
            title = `${number}. ${parts.join(' - ')}`
        }
        const episodeItem = document.createElement('li')
        episodeItem.textContent = title
        episodeItem.addEventListener('click', () => navigateEpisode(show, season, episode))
        episodeList.appendChild(episodeItem)
    })
    nav.dataset.mode = 'season'
    nav.appendChild(episodeList)
    displayAiredRange()
    setBackgroundColor(BackgroundState.SEASON)
    updateAnalysisDisplay(show, season)
}

function navigateEpisode(show, season, episode) {
    clearNav()
    addPathBar(show, season, episode)
    const path = `${show}/formatted/${season}/${episode}`
    readFile(path).then((text) => {
        text = text.split('\n')
        const title = text.shift()
        text = text.join('\n')
        const titleElement = document.createElement('h2')
        titleElement.textContent = title
        nav.appendChild(titleElement)
        const script = document.createElement('p')
        script.textContent = text
        nav.appendChild(script)
    })
    nav.dataset.mode = 'episode'
    displayAiredRange()
    setBackgroundColor(BackgroundState.EPISODE)
    updateAnalysisDisplay(show, season, episode)
}

async function getFrequency(show, season = null, episode = null) {
    let path = `${show}/analysis/word_frequency`
    if (episode) path += `/episode/${season}/${episode}`
    else if (season) path += `/season/${season}.txt`
    else path += `/show.txt`
    const text = await readFile(path)
    return text
}

async function getOrder(show, season = null, episode = null) {
    let path = `${show}/analysis/word_order`
    if (episode) path += `/episode/${season}/${episode}`
    else if (season) path += `/season/${season}.txt`
    else path += `/show.txt`
    const text = await readFile(path)
    return text
}

function updateAnalysisDisplay(show = null, season = null, episode = null) {
    if (!show) {
        frequency.textContent = 'Select a show, season, or episode to view analysis.'
        // order.textContent = ''
        return
    }
    while (frequency.firstChild) {
        frequency.removeChild(frequency.firstChild)
    }
    frequency.textContent = 'Requesting Data...'
    // order.textContent = 'Requesting Data...'
    getFrequency(show, season, episode).then((text) => {
        frequency.textContent = 'Loading...'
        // console.log("before callback")
        // setTimeout(() => {
            // console.log("callback")
            asyncFrequencyUpdate(text)
        // }, 5)
        // console.log("after callback")
        // frequency.textContent = 'Data Received'
        // const list = document.createElement('ul')
        // const frequencyArray = text.split('\n')
        // frequencyArray.forEach((word, index) => {
        //     if (word === '') frequencyArray.splice(index, 1)
        // })
        // frequencyArray.forEach((word, index) => {
        //     frequency.textContent = `Loading Data... ${index + 1}/${frequencyArray.length}`
        //     const entry = document.createElement('li')
        //     entry.className = 'filterable'
        //     const number = document.createElement('span')
        //     number.classList = 'show-on-parent-hover'
        //     number.textContent = `${index + 1}. `
        //     let key = word.split('_')[0]
        //     const part = word.split('_')[1].split(':')[0]
        //     const count = nf.format(word.split(': ')[1])
        //     if (part === 'PROPN') key = key[0].toUpperCase() + key.slice(1)
        //     entry.textContent = `${key}: ${count}`
        //     entry.dataset.type = part
        //     entry.insertBefore(number, entry.firstChild)
        //     list.appendChild(entry)
        // })
        // frequency.textContent = ''
        // frequency.appendChild(list)
        // const filterLabel = document.querySelector('.filter-label')
        // applyFilter(filterTypes[filterLabel.textContent])
    }).catch((e) => {
        console.error('Error fetching frequency:', e)
    })
    // getOrder(show, season, episode).then((text) => {
    //     asyncOrderUpdate(text)
    // })
}

async function asyncFrequencyUpdate(text) {
    // console.log("called")
    // await new Promise(resolve => setTimeout(resolve, 0))
    // console.log("going fr")
    frequency.textContent = ''
    const list = document.createElement('ul')
    const frequencyArray = text.split('\n')
    frequencyArray.forEach((word, index) => {
        if (word === '') frequencyArray.splice(index, 1)
    })
    frequency.appendChild(list)
    const increment = Math.floor(frequencyArray.length / 10)
    const markedWords = getMarkedWords()
    for (let index = 0; index < frequencyArray.length; index++) {
        const word = frequencyArray[index]

        // frequency.textContent = `Loading Data... ${nf.format(index / frequencyArray.length * 100)}%`

        const entry = document.createElement('li')
        entry.className = 'filterable'

        const number = document.createElement('span')
        number.classList = 'show-on-parent-hover'
        number.textContent = `${index + 1}. `

        let key = word.split('_')
        key.pop()
        key = key.join('_')
        let part = word.split('_')
        part = part[part.length - 1].split(':')[0]
        const count = nf.format(word.split(': ')[1])

        if (part === 'PROPN') key = key[0].toUpperCase() + key.slice(1)

        entry.addEventListener('click', () => {
            entry.classList.toggle('marked')
            const marked = entry.classList.contains('marked')
            if (marked) {
                addMarkedWord(entry.dataset.word, entry.dataset.type)
            } else {
                removeMarkedWord(entry.dataset.word, entry.dataset.type)
            }
        })
        if (markedWords.includes(`${key}_${part}`)) entry.classList.add('marked')
        entry.textContent = `${key}: ${count}`
        entry.dataset.word = key
        entry.dataset.count = word.split(': ')[1]
        entry.dataset.type = part
        entry.title = filterNames[part]
        entry.insertBefore(number, entry.firstChild)
        list.appendChild(entry)

        // Pause execution for a short period to prevent freezing the browser
        // if (index % increment === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const filterLabel = document.querySelector('.filter-label')
    applyFilter(filterTypes[filterLabel.textContent])
    applySearch()
}

async function asyncOrderUpdate(text) {
    const list = document.createElement('ul');
    const orderArray = text.split('\n');
    orderArray.forEach((word, index) => {
        if (word === '') orderArray.splice(index, 1);
    });
    order.textContent = '';
    order.appendChild(list);
    const increment = Math.floor(orderArray.length / 10)
    for (let index = 0; index < orderArray.length; index++) {
        const word = orderArray[index];
        if (word === '') continue;

        // order.textContent = `Loading Data... ${nf.format(index / orderArray.length * 100)}%`;

        const entry = document.createElement('li');
        entry.className = 'filterable';

        const number = document.createElement('span');
        number.classList = 'show-on-parent-hover';
        number.textContent = `${index + 1}. `;

        let key = word.split('_')[0];
        const part = word.split('_')[1];

        if (part === 'PROPN') key = key[0].toUpperCase() + key.slice(1);

        entry.textContent = key;
        entry.dataset.type = part;
        entry.insertBefore(number, entry.firstChild);
        list.appendChild(entry);

        // Pause execution for a short period to prevent freezing the browser
        if (index % increment === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }


    const filterLabel = document.querySelector('.filter-label');
    applyFilter(filterTypes[filterLabel.textContent]);
}

function addMarkedWord(word, part) {
    const markedWords = document.querySelector('.marked-words')
    const entry = document.createElement('li')
    entry.dataset.word = word
    entry.dataset.type = part
    entry.textContent = `${word} (${filterNames[part]})`
    entry.addEventListener('click', () => {
        entry.remove()
        const frequencyContent = document.querySelector('.frequency-content')
        const frequencyList = frequencyContent.querySelector('ul') || {}
        const frequencyEntries = frequencyList.childNodes || []
        const item = Array.from(frequencyEntries).find(el => el.dataset.word === word && el.dataset.type === part)
        if (item) item.classList.remove('marked')
    })
    markedWords.appendChild(entry)
}

function removeMarkedWord(word, part) {
    const markedWords = document.querySelector('.marked-words')
    const entry = Array.from(markedWords.childNodes).find(el => el.dataset.word === word && el.dataset.type === part)
    if (entry) entry.remove()
    else console.log("could not find entry " + word + " of part " + part)
}

function getMarkedWords() {
    const markedWords = document.querySelector('.marked-words')
    const marked = []
    markedWords.childNodes.forEach(el => {
        marked.push(`${el.dataset.word}_${el.dataset.type}`)
    })
    return marked
}

function savePage() {
    const path = document.querySelector('.path-bar').childNodes
    if (path.length === 1) return
    const array = [path[2].title]
    if (path.length > 3) array.push(path[4].title)
    if (path.length > 5) array.push(path[6].title)
    savedPages.push(array)
    updateSavedPages()
}

function updateSavedPages() {
    const savedPagesBar = document.querySelector('.saved-pages')
    let arrow = savedPagesBar.querySelector('.arrow')
    while (savedPagesBar.firstChild) {
        savedPagesBar.removeChild(savedPagesBar.firstChild)
    }
    const savedHeader = document.createElement('p')
    savedHeader.textContent = `Saved Pages (${savedPages.length})`
    if (arrow) {
        arrow.textContent = '▲'
        savedHeader.insertBefore(arrow, savedHeader.firstChild)
    }
    const savePageButton = document.createElement('span')
    savePageButton.textContent = '[+]'
    savePageButton.className = 'save-page-button right'
    savePageButton.addEventListener('click', savePage, true)
    savedHeader.appendChild(savePageButton)
    savedPagesBar.appendChild(savedHeader)
    const savedList = document.createElement('ul')
    savedPages.forEach((path) => {
        const savedItem = document.createElement('li')
        switch (path.length) {
            case 1:
                savedItem.textContent = getShowTitle(path[0])
                savedItem.style.color = 'blue'
                savedItem.addEventListener('click', () => navigateShow(path[0]))
                break
            case 2:
                savedItem.textContent = getShowTitle(path[0]) + " " + getSeasonTitle(path[1])
                savedItem.style.color = 'green'
                savedItem.addEventListener('click', () => navigateSeason(path[0], path[1]))
                break
            case 3:
                savedItem.textContent = getShowTitle(path[0]) + " " + getSeasonTitle(path[1]) + " " + getEpisodeTitle(path[2])
                savedItem.style.color = 'red'
                savedItem.addEventListener('click', () => navigateEpisode(path[0], path[1], path[2]))
                break
        }
        const removeButton = document.createElement('span')
        removeButton.textContent = '[-]'
        removeButton.className = 'remove-page-button right'
        removeButton.addEventListener('click', (event) => {
            event.stopPropagation()
            savedPages = savedPages.filter((page) => page !== path)
            updateSavedPages()
        }, true)
        savedItem.appendChild(removeButton)
        savedList.appendChild(savedItem)
    })
    savedPagesBar.appendChild(savedList)
}

const filterTypes = {
    "No Filter": "ALL",
    "Adjective": "ADJ",
    "Adposition": "ADP",
    "Adverb": "ADV",
    "Auxiliary": "AUX",
    "Conjunction": "CONJ",
    "Coordinating Conjunction": "CCONJ",
    "Determiner": "DET",
    "Interjection": "INTJ",
    "Noun": "NOUN",
    "Numeral": "NUM",
    "Particle": "PART",
    "Pronoun": "PRON",
    "Proper Noun": "PROPN",
    "Punctuation": "PUNCT",
    "Subordinating Conjunction": "SCONJ",
    "Symbol": "SYM",
    "Verb": "VERB",
    "Other": "X"
}

const filterNames = Object.fromEntries(Object.entries(filterTypes).map(([key, value]) => [value, key]))

const moreFilterTypes = [
    "Adposition",
    "Auxiliary",
    "Conjunction",
    "Coordinating Conjunction",
    "Determiner",
    "Interjection",
    "Numeral",
    "Particle",
    "Pronoun",
    "Punctuation",
    "Subordinating Conjunction",
    "Symbol",
    "Other"
]

function createFilterBar() {
    const filterBar = document.querySelector('.filter')
    const text = document.createElement('p')
    text.textContent = 'Filter'
    const filterLabel = document.createElement('span')
    filterLabel.textContent = 'No Filter'
    filterLabel.className = 'filter-label'
    filterLabel.style.display = 'none'
    text.appendChild(filterLabel)
    filterBar.appendChild(text)
    const filterList = document.createElement('ul')
    for (const type in filterTypes) {
        const filterItem = document.createElement('li')
        filterItem.textContent = type
        filterItem.className = 'filter-item'
        if (type === 'No Filter') filterItem.classList.add('selected')
        if (moreFilterTypes.includes(type)) {
            filterItem.classList.add('more-filter')
            filterItem.style.display = 'none'
        }
        filterItem.dataset.type = filterTypes[type]
        filterItem.addEventListener('click', () => {
            filterList.childNodes.forEach((item) => {
                item.classList.remove('selected')
            })
            filterItem.classList.add('selected')
            filterLabel.textContent = filterNames[filterItem.dataset.type]
            filterLabel.style.display = (filterItem.dataset.type === 'ALL') ? 'none' : 'inline'
            applyFilter(filterItem.dataset.type)
            applySearch()
        })
        filterList.appendChild(filterItem)
    }
    const moreFilter = document.createElement('li')
    moreFilter.textContent = 'Show More...'
    moreFilter.addEventListener('click', () => {
        const reveal = moreFilter.textContent === 'Show More...'
        filterList.childNodes.forEach((item) => {
            if (item.classList.contains('more-filter')) {
                item.style.display = reveal ? 'list-item' : 'none'
            }
        })
        moreFilter.textContent = reveal ? 'Show Less...' : 'Show More...'
    })
    filterList.appendChild(moreFilter)
    filterBar.appendChild(filterList)
}

function applyFilter(type) {
    console.log("applying filter")
    const filterable = document.querySelectorAll('.filterable')
    filterable.forEach((element) => {
        if (type === 'ALL') element.style.display = 'block'
        else if (element.dataset.type !== type) element.style.display = 'none'
        else element.style.display = 'block'
    })
    // if (!doNotSearch) applySearch()
}

function initCollapsibleBars() {
    const collapsibleBars = document.querySelectorAll('.collapsible')
    collapsibleBars.forEach((bar) => {
        const arrow = document.createElement('span')
        arrow.textContent = '▼'
        arrow.className = 'arrow'
        if (bar.firstElementChild && bar.firstElementChild.firstChild) bar.firstElementChild.insertBefore(arrow, bar.firstElementChild.firstChild)
        else bar.firstElementChild.appendChild(arrow)
        arrow.addEventListener('click', () => {
            // dont get text-only nodes
            const children = Array.from(bar.children).filter((child) => child.nodeType === 1)
            if (arrow.textContent === '▲') {
                children.forEach((child) => {
                    if (child.tagName !== 'P' && !child.classList.contains('arrow')) {
                        child.style.display = 'none'
                    } else {
                        child.style.display = 'block'
                    }
                })
                arrow.textContent = '▼'
            } else {
                children.forEach((child) => {
                    child.style.display = 'block'
                })
                arrow.textContent = '▲'
            }
        })
        const children = Array.from(bar.children).filter((child) => child.nodeType === 1)
        children.forEach((child) => {
            if (child.tagName !== 'P' && !child.classList.contains('arrow')) {
                child.style.display = 'none'
            } else {
                child.style.display = 'block'
            }
        })
    })
    if (Object.keys(showMap).length === 0) {
        const helpBar = document.querySelector('.help')
        const helpArrow = helpBar.querySelector('.arrow')
        helpArrow.click()
    }
}

function setupVisualization() {
    const visualizationBar = document.querySelector('.visualization-bar')
    const visualizeMultipleCheckbox = document.createElement('input')
    visualizeMultipleCheckbox.type = 'checkbox'
    visualizeMultipleCheckbox.id = 'visualize-multiple'
    visualizeMultipleCheckbox.name = 'visualize-multiple'
    visualizeMultipleCheckbox.checked = false
    const visualizeMultipleLabel = document.createElement('label')
    visualizeMultipleLabel.textContent = 'Visualize Multiple '
    visualizeMultipleLabel.htmlFor = 'visualize-multiple'
    visualizeMultipleLabel.title = 'If checked, previous visualizations will not be cleared when displaying new ones'
    const heatmapButton = document.createElement('button')
    heatmapButton.textContent = 'Visualize Marked Words'
    const smoothCheckbox = document.createElement('input')
    smoothCheckbox.type = 'checkbox'
    smoothCheckbox.id = 'smooth'
    smoothCheckbox.name = 'smooth'
    smoothCheckbox.checked = true
    const smoothLabel = document.createElement('label')
    smoothLabel.textContent = ' Smooth '
    smoothLabel.htmlFor = 'smooth'
    smoothLabel.title = 'Smoothing is recommended when visualizing many episodes'
    heatmapButton.addEventListener('click', async () => {
        const marked = document.querySelector('.marked-words').childNodes
        if (marked.length === 0) return
        const words = Array.from(marked).map((element) => element.dataset.word.toLowerCase() + '_' + element.dataset.type)
        const path = document.querySelector('.path-bar').childNodes
        if (path.length === 1) {
            if (!visualizeMultipleCheckbox.checked) {
                const visualizationContent = document.querySelector('.visualization-content')
                while (visualizationContent.firstChild) {
                    visualizationContent.removeChild(visualizationContent.firstChild)
                }
            }
            let shows = Object.keys(showMap)
            for (const show of shows) {
                await visualizeWords(words, show, null, smoothCheckbox.checked, true)
            }
            return
        }
        heatmapButton.disabled = true
        if (path.length > 3) visualizeWords(words, path[2].title, path[4].title, smoothCheckbox.checked).then(() => heatmapButton.disabled = false)
        else visualizeWords(words, path[2].title, null, smoothCheckbox.checked).then(() => heatmapButton.disabled = false)
    })
    const wordCloudButton = document.createElement('button')
    wordCloudButton.textContent = 'Word Cloud'
    wordCloudButton.addEventListener('click', async() => {
        const path = document.querySelector('.path-bar').childNodes
        if (path.length === 1) return
        wordCloudButton.disabled = true
        if (path.length === 3) await worldCloud(path[2].title)
        else if (path.length === 5) await worldCloud(path[2].title, path[4].title)
        else await worldCloud(path[2].title, path[4].title, path[6].title)
        wordCloudButton.disabled = false
    })
    const clearButton = document.createElement('button')
    clearButton.textContent = 'Clear'
    clearButton.addEventListener('click', () => {
        const visualizationContent = document.querySelector('.visualization-content')
        while (visualizationContent.firstChild) {
            visualizationContent.removeChild(visualizationContent.firstChild)
        }
    })
    const separator = document.createElement('span')
    separator.textContent = ' | '
    visualizationBar.appendChild(separator)
    visualizationBar.appendChild(visualizeMultipleLabel)
    visualizationBar.appendChild(visualizeMultipleCheckbox)
    visualizationBar.appendChild(separator.cloneNode(true))
    visualizationBar.appendChild(heatmapButton)
    visualizationBar.appendChild(smoothLabel)
    visualizationBar.appendChild(smoothCheckbox)
    visualizationBar.appendChild(separator.cloneNode(true))
    visualizationBar.appendChild(wordCloudButton)
    visualizationBar.appendChild(separator.cloneNode(true))
    visualizationBar.appendChild(clearButton)
}

async function visualizeWords(words, show, season = null, smooth = true, visualizingMultiple = false) {
    try {
        let path = '/api/heatmap?words=' + words.join(',') + '&show=' + show + '&smooth=' + smooth
        if (season) path += '&season=' + season
        const request = await fetch(path)
        const response = await request.text()
        const image = document.createElement('img')
        const uri = 'data:image/png;base64,' + response
        image.src = uri
        image.alt = 'Visualization'
        const visualization = document.querySelector('.visualization-content')
        if (!visualizingMultiple && !document.querySelector('#visualize-multiple').checked) {
            while (visualization.firstChild) {
                visualization.removeChild(visualization.firstChild)
            }
        }
        visualization.appendChild(image)
    } catch (err) {
        console.error('Error fetching visualization:', err)
        throw err
    }
}

async function worldCloud(show, season=null, episode=null) {
    try {
        const visualization = document.querySelector('.visualization-content')
        const size = visualization.getBoundingClientRect()
        const width = Math.floor(size.width)
        const height = Math.floor(size.height) - 3
        console.log(width, height, visualization.clientWidth, visualization.clientHeight)
        let path = `/api/wordcloud?width=${width}&height=${height}&show=${show}`
        if (season) path += '&season=' + season
        if (episode) path += '&episode=' + episode
        const filterLabel = document.querySelector('.filter-label')
        const filterType = filterTypes[filterLabel.textContent]
        if (filterType !== 'ALL') path += '&filter=' + filterType
        const request = await fetch(path)
        const response = await request.text()
        const image = document.createElement('img')
        const uri = 'data:image/png;base64,' + response
        image.src = uri
        image.alt = 'Word Cloud'
        if (!document.querySelector('#visualize-multiple').checked) {
            while (visualization.firstChild) {
                visualization.removeChild(visualization.firstChild)
            }
        }
        visualization.appendChild(image)
    } catch (err) {
        console.error('Error fetching visualization:', err)
        throw err
    }
}


// let typingTimer
function createSearchBar() {
    const frequencyBar = document.querySelector('.frequency-bar')
    const searchBar = document.createElement('input')
    searchBar.type = 'text'
    searchBar.placeholder = 'Search...'
    searchBar.className = 'right'
    searchBar.title = 'Search for multiple words by separating them with spaces and use quotes for exact matches'
    searchBar.addEventListener('change', (event) => {
        const searchTerm = event.target.value.trim()
        applySearch(searchTerm)
    })
    frequencyBar.appendChild(searchBar)
}


let lastSearchedTerm = ''
const exactMatchCriteria = /"(\w+)"/
function applySearch(term = null) {
    console.log("searching")
    const message = document.getElementById('search-hidden-by-filter-message')
    if (message) message.remove()
    if (term === '') {
        lastSearchedTerm = ''
        const filterLabel = document.querySelector('.filter-label')
        applyFilter(filterTypes[filterLabel.textContent])
        return
    }
    if (term === null) term = lastSearchedTerm
    const searchTerms = term.split(' ')
    const filterable = document.querySelectorAll('.filterable')
    const filterLabel = document.querySelector('.filter-label')
    const filterType = filterTypes[filterLabel.textContent]
    const exactSearchTerms = []
    searchTerms.forEach((searchTerm) => {
        const exactMatch = searchTerm.match(exactMatchCriteria)
        if (exactMatch) {
            exactSearchTerms.push(exactMatch[1])
            searchTerms.splice(searchTerms.indexOf(searchTerm), 1)
        }
    })
    let hitButFiltered = []
    filterable.forEach((element) => {
        let hit = false
        searchTerms.forEach((searchTerm) => {
            if (element.dataset.word.toLowerCase().includes(searchTerm.toLowerCase())) hit = true
        })
        exactSearchTerms.forEach((searchTerm) => {
            if (element.dataset.word.toLowerCase() === searchTerm.toLowerCase()) hit = true
        })
        if (hit) {
            if (filterType !== 'ALL' && element.dataset.type !== filterType) hitButFiltered.push(element)
            else element.style.display = 'block'
        }
        else element.style.display = 'none'
    })
    if (hitButFiltered.length > 0) {
        const frequencyContent = document.querySelector('.frequency-content')
        const message = document.createElement('em')
        message.id = 'search-hidden-by-filter-message'
        message.textContent = `${hitButFiltered.length} result${(hitButFiltered.length === 1) ? '' : 's'} hidden by filter`
        message.title = hitButFiltered.map((element) => `${element.dataset.word} (${filterNames[element.dataset.type]})`).join(', ')
        frequencyContent.insertBefore(message, frequencyContent.firstChild)
    }
    lastSearchedTerm = term
}

function searchForums(substring) {
    const forums = document.querySelectorAll('.import ul li')
    forums.forEach((forum) => {
        if (forum.dataset.title.toLowerCase().includes(substring.toLowerCase())) forum.style.display = 'list-item'
        else forum.style.display = 'none'
    })
    if (substring !== '') {
        const importArrow = document.querySelector('.import .arrow')
        if (importArrow.textContent === '▼') importArrow.click()
    }
}

function createImportBar() {
    const importBar = document.querySelector('.import')
    const importTitle = document.createElement('p')
    importTitle.textContent = 'Import'
    const importSearch = document.createElement('input')
    importSearch.type = 'text'
    importSearch.placeholder = 'Search Forums...'
    importSearch.className = 'right'
    importSearch.addEventListener('change', (event) => {
        searchForums(event.target.value.trim())
    })
    importTitle.appendChild(importSearch)
    importBar.appendChild(importTitle)
    const importList = document.createElement('ul')
    importList.className = 'import-list'
    forums.forEach((forum) => {
        const importItem = document.createElement('li')
        importItem.textContent = forum.title
        importItem.title = forum.desc
        importItem.dataset.title = forum.title
        importItem.dataset.id = forum.id
        const importEpisodeCount = document.createElement('span')
        importEpisodeCount.textContent = `${nf.format(forum.episodes)} Episode${(forum.episodes === 1) ? '' : 's'}`
        importEpisodeCount.className = 'right'
        importItem.appendChild(importEpisodeCount)
        importItem.addEventListener('click', () => {
           importShow(forum)
        })
        importList.appendChild(importItem)
    })
    importBar.appendChild(importList)
}

function importShow(forum) {
    const importList = document.querySelector('.import-list')
    importList.remove()
    const progress = document.createElement('p')
    progress.textContent = `Currently importing ${forum.title}. Check the server console for progress.`
    const importBar = document.querySelector('.import')
    importBar.appendChild(progress)
    fetch(`/api/add_show?show=${forum.id}&name=${encodeURIComponent(forum.title)}`).then( async(response) => {
        if (response.ok) {
            // progress.textContent = `Successfully imported ${forum.title}. Refresh the page to view the show.`
            let newShowMap = await getJSONfromAPI('showmap')
            let newShowTitles = await getJSONfromAPI('showtitles')
            showMap = newShowMap
            showTitles = newShowTitles
            if (document.querySelector('.path-bar').childNodes.length === 1) {
                navigateOverview()
            }
            progress.remove()
            importBar.appendChild(importList)
        }
        else progress.textContent = `Error importing ${forum.title}. Check the server console for details.`
    })
}

function createHelpBar() {
    const helpBar = document.querySelector('.help')
    const helpTitle = document.createElement('p')
    helpTitle.textContent = 'Help'
    helpBar.appendChild(helpTitle)
    helpBar.appendChild(document.createElement('hr'))
    const helpText = document.createElement('span')
    helpText.style.margin = '3px'
    helpText.textContent = 'This is a tool to analyze shows. To get started, you will need to import a show. Open the import tab and search for a show. Click on a show to import it. Once imported, you can navigate through the show by clicking on the show, season, or episode in the navigation bar. To go back, right click in the navigation window or click on the text in the top navigation bar. You can also save pages by clicking the [+] button next to the saved pages header. Once you nagivate to a show, season, or episode, the word frequency for that show, season, or episode will display in the middle column. You can filter the word frequency by part of speech by clicking on the filter bar. You can also search for specific words by typing in the search bar. Click on words in the word frequency to mark them. To visualize the analysis, click on the visualize button. You can visualize multiple words at once by checking the visualize multiple checkbox. You can also create a word cloud by clicking on the word cloud button. To clear the visualization, click on the clear button. To remove a saved page, click on the [-] button next to the saved page.'
    helpBar.appendChild(helpText)
}

let showMap = {}
let showTitles = {}
let forums = []
let nav = document.querySelector('.nav-content')
let frequency = document.querySelector('.frequency-content')
// let order = document.querySelector('.order-content')
let savedPages = []

nav.oncontextmenu = () => {
    const pathBar = document.querySelector('.path-bar')
    const path = pathBar.childNodes
    if (path.length > 1) {
        const itemToClick = path[path.length - 3]
        itemToClick.click()
    }
    return false
}

document.addEventListener('DOMContentLoaded', async() => {
    const pathBar = document.querySelector('.path-bar')
    showMap = await getJSONfromAPI('showmap')
    pathBar.textContent = 'Loading... (1/3)'
    showTitles = await getJSONfromAPI('showtitles')
    pathBar.textContent = 'Loading... (2/3)'
    forums = await getJSONfromAPI('forums')
    pathBar.textContent = 'Loading... (3/3)'
    navigateOverview()
    updateSavedPages()
    createFilterBar()
    createImportBar()
    createHelpBar()
    initCollapsibleBars()
    setupVisualization()
    createSearchBar()
                // const orderBar = document.querySelector('.order')
                // let orderTitle = document.createElement('p')
                // orderTitle.textContent = 'Word Order'
                // orderBar.appendChild(orderTitle)
                // order = document.createElement('div')
                // order.classList = 'order-content content-box'
                // orderBar.appendChild(order)
})
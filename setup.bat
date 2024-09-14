echo 'Installing required packages...'
pip install beautifulsoup4 matplotlib numpy pandas requests tqdm spacy spacytextblob wordcloud
python -m spacy download en_core_web_sm
echo 'Done installing required packages.'
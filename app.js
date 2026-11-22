'use strict';

const SITE_TABS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'music', label: 'Nhạc', description: 'Khám phá những bản thu, album và các dự án âm nhạc của Duy TTD Studio.' },
  { id: 'news', label: 'Tin âm nhạc', description: 'Thông tin về bài mới, lịch ra MV và hoạt động của các kênh.' },
  { id: 'apps', label: 'Mini app', description: 'Các tiện ích của studio cho công việc làm nhạc, phụ đề và dựng MV.' },
  { id: 'contact', label: 'Liên hệ', description: 'Duy TTD Studio' },
];

const byId = id => document.getElementById(id);
const readData = id => JSON.parse(byId(id).textContent);
const channels = readData('channel-data');
const details = readData('channel-details');
const publicVideos = readData('public-video-data');
const config = readData('site-config');
const baseYouTube = 'https://www.youtube.com/';
const videoId = track => /^[\w-]{11}$/.test(track?.video || '') ? track.video : '';
const watchUrl = id => baseYouTube + 'watch?v=' + id;
const normalize = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function button(className, text, onClick) {
  const el = node('button', className, text);
  el.type = 'button';
  el.addEventListener('click', onClick);
  return el;
}

function tabs(tablist, onSelect) {
  function select(tab) {
    for (const item of tablist.children) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    onSelect(tab.dataset.id);
  }

  tablist.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (tab?.parentElement === tablist) select(tab);
  });
  tablist.addEventListener('keydown', event => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(tablist.children);
    const current = items.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    select(items[next]);
  });
  return select;
}

function addTab(tablist, { id, label, handle }, panelId) {
  const tab = node('button', '', label);
  tab.id = tablist.id + '-' + id;
  tab.type = 'button';
  tab.dataset.id = id;
  if (handle) tab.dataset.handle = handle;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', panelId);
  tab.setAttribute('aria-selected', 'false');
  tab.tabIndex = -1;
  tablist.append(tab);
  return tab;
}

function openTab(id) {
  const tab = byId('site-tabs-' + id);
  tab.click();
  tab.focus();
}

const siteTabs = byId('site-tabs');
const panels = new Map();

for (const item of SITE_TABS) {
  const panel = node('section', item.id === 'youtube' ? '' : 'simple-panel');
  panel.id = 'page-' + item.id;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', addTab(siteTabs, item, panel.id).id);
  panel.tabIndex = 0;
  panel.hidden = true;

  if (item.id === 'youtube') {
    panel.append(byId('youtube-page').content.cloneNode(true));
  } else {
    panel.append(node('h1', '', item.label), node('p', '', item.description));
    if (item.id === 'music') panel.append(byId('music-page').content.cloneNode(true));
    if (item.id === 'contact') {
      panel.append(node('p', '', 'Hợp tác âm nhạc, truyền thông và tài trợ cho xưởng nhạc độc lập Việt Nam.'));
      if (/^[a-z0-9._+-]+@duyttdstudio\.io\.vn$/i.test(config.publicEmail || '')) {
        const mail = node('a', 'watch-link', config.publicEmail);
        mail.href = 'mailto:' + config.publicEmail;
        panel.append(mail);
      }
      const links = node('nav', 'actions');
      links.setAttribute('aria-label', 'Tìm hiểu studio');
      for (const [file, title] of [['gioi-thieu', 'Giới thiệu'], ['lien-he', 'Liên hệ'], ['chinh-sach-rieng-tu', 'Chính sách riêng tư']]) {
        const link = node('a', 'button button-quiet', title);
        link.href = './' + file + '.html';
        links.append(link);
      }
      panel.append(links);
    }
  }

  byId('site-panels').append(panel);
  panels.set(item.id, panel);
}

document.querySelector('[data-open-youtube]')?.addEventListener('click', () => openTab('youtube'));

const channelTabs = byId('channel-tabs');
const channelPanel = byId('channel-panel');
const search = byId('song-search');
const grid = byId('track-grid');
const frame = byId('youtube-player');
const mediaCover = byId('media-cover');
const status = byId('player-status');
const player = byId('player');
const popup = byId('popup-track');
const watch = byId('watch-track');
const play = byId('play-track');
const listen = byId('listen-now');
const previous = byId('previous-track');
const next = byId('next-track');
const shuffle = byId('shuffle-track');


let channel;
let tracks = [];
let selected;

function setArtwork(container, track) {
  container.dataset.tone = track?.tone || 'rose';
  const id = videoId(track);
  if (!id) return;
  const image = node('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
  container.prepend(image);
}

function stopVideo() {
  frame.hidden = true;
  frame.removeAttribute('src');
  mediaCover.hidden = false;
  status.textContent = '';
}

function playSelected() {
  const id = videoId(selected);
  if (!id) return;
  if (location.protocol === 'file:') {
    // file:// không cung cấp Referer HTTP cho trình nhúng YouTube.
    status.textContent = 'Đã yêu cầu mở bài trên YouTube trong thẻ mới.';
    watch.click();
    return;
  }
  const embed = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1';
  if (frame.getAttribute('src') !== embed) frame.src = embed;
  frame.title = 'YouTube: ' + selected.title;
  frame.hidden = false;
  mediaCover.hidden = true;
  frame.focus();
}

function visibleTracks() {
  const query = normalize(search.value);
  return tracks.filter(track => normalize(track.title + ' ' + track.genre).includes(query));
}

function showTracks() {
  const visible = visibleTracks();
  grid.replaceChildren();
  byId('results-count').textContent = visible.length
    ? visible.length + ' / ' + tracks.length + ' bài'
    : 'Không tìm thấy bài hát.';
  previous.disabled = next.disabled = shuffle.disabled = visible.length < 2;

  for (const track of visible) {
    const card = node('article', 'track-card');
    card.classList.toggle('is-current', track === selected);
    const art = node('div', 'track-art');
    setArtwork(art, track);
    const duration = node('span', 'track-duration', track.duration || '—:—');
    if (!track.duration) duration.title = 'Chưa có thời lượng';
    art.append(duration);

    const body = node('div', 'track-body');
    const action = button('button button-small' + (track === selected ? ' button-primary' : ' button-quiet'),
      videoId(track) ? '▶ Phát' : 'Chọn bài', () => selectTrack(track, true));
    action.setAttribute('aria-label', (videoId(track) ? 'Phát ' : 'Chọn ') + track.title);
    if (track === selected) action.setAttribute('aria-current', 'true');
    body.append(node('h3', '', track.title), node('p', 'track-meta', track.genre), action);
    card.append(art, body);
    grid.append(card);
  }
}

function selectTrack(track, start = false) {
  stopVideo();
  selected = track;
  const id = videoId(track);
  const title = byId('selected-title');
  title.textContent = track?.title || 'Khám phá âm nhạc trên kênh';
  byId('selected-meta').textContent = track ? [track.genre, track.duration].filter(Boolean).join(' · ') : '';
  mediaCover.querySelector('img')?.remove();
  setArtwork(mediaCover, track);
  mediaCover.querySelector('.cover-caption').textContent = id ? 'Phát video' : 'Mở kênh YouTube để nghe thêm';
  mediaCover.setAttribute('aria-label', id ? 'Phát ' + track.title : 'Danh sách đang cập nhật');
  mediaCover.disabled = play.disabled = listen.disabled = !id;
  watch.hidden = popup.hidden = !id;

  if (id) {
    watch.href = popup.href = watchUrl(id);
  } else {
    watch.removeAttribute('href');
    popup.removeAttribute('href');
    status.textContent = 'Danh sách đang cập nhật. Bạn có thể mở kênh YouTube để nghe nhạc.';
  }

  showTracks();
  if (start) {
    title.focus();
    playSelected();
  }
}

function moveTrack(step) {
  const visible = visibleTracks();
  if (!visible.length) return;
  const index = visible.indexOf(selected);
  const nextIndex = index < 0 ? (step > 0 ? 0 : visible.length - 1)
    : (index + step + visible.length) % visible.length;
  selectTrack(visible[nextIndex], !frame.hidden);
}

const selectChannel = tabs(channelTabs, id => {
  if (channel?.id === id) return;
  channel = channels.find(item => item.id === id);
  const info = details.channels[id] || {};
  const data = (publicVideos.channels || []).find(item => item.handle === channel.handle);
  tracks = (data?.videos || []).filter(video => /^[\w-]{11}$/.test(video?.id || '')
    && typeof video.tieuDe === 'string' && video.tieuDe.trim()).map(video => ({
    video: video.id, title: video.tieuDe, duration: video.thoiLuong || '', genre: channel.name,
    tone: info.tone,
  }));
  channelPanel.setAttribute('aria-labelledby', 'channel-tabs-' + id);
  byId('channel-title').textContent = channel.name;
  byId('channel-style').textContent = info.style || 'Kênh YouTube';
  byId('channel-description').textContent = info.description || 'Khám phá âm nhạc từ kênh của Duy TTD Studio.';
  byId('channel-handle').textContent = channel.handle;
  byId('channel-link').href = baseYouTube + channel.handle;
  channelPanel.querySelector('.channel-hero').dataset.tone = info.tone || 'rose';
  byId('data-stamp').textContent = tracks.length ? tracks.length + ' video trên kênh' : 'Đang cập nhật';
  const readAt = new Date(data?.docLuc || '');
  byId('data-stamp').title = Number.isNaN(readAt.getTime()) ? '' : 'Cập nhật: ' + readAt.toLocaleString('vi-VN');
  search.value = '';
  selectTrack(tracks[0]);
});

for (const info of [...channels].sort((a, b) => Number(b.id === 'other') - Number(a.id === 'other'))) {
  addTab(channelTabs, { ...info, label: info.name }, channelPanel.id);
}
if (channelTabs.firstElementChild) selectChannel(channelTabs.firstElementChild);
else channelPanel.hidden = true;

const selectSite = tabs(siteTabs, id => {
  for (const [tabId, panel] of panels) panel.hidden = id !== tabId;
  if (id !== 'youtube' && !frame.hidden) stopVideo();
});
selectSite(siteTabs.firstElementChild);

search.addEventListener('input', showTracks);
play.addEventListener('click', playSelected);
mediaCover.addEventListener('click', playSelected);
listen.addEventListener('click', () => {
  player.scrollIntoView({ block: 'nearest' });
  playSelected();
});
previous.addEventListener('click', () => moveTrack(-1));
next.addEventListener('click', () => moveTrack(1));
shuffle.addEventListener('click', () => {
  const choices = visibleTracks().filter(track => track !== selected);
  if (choices.length) selectTrack(choices[Math.floor(Math.random() * choices.length)], !frame.hidden);
});
popup.addEventListener('click', event => {
  event.preventDefault();
  window.open(popup.href, '_blank', 'popup,width=720,height=480,noopener');
  if (!frame.hidden) stopVideo();
});
byId('contact-action').addEventListener('click', () => openTab('contact'));

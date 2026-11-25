'use strict';

const SITE_TABS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'music', label: 'Nhạc', description: 'Khám phá những bản thu, album và các dự án âm nhạc của Duy TTD Studio.' },
  { id: 'news', label: 'Tin âm nhạc', description: 'Thông tin về bài mới, lịch ra MV và hoạt động của các kênh.' },
  { id: 'apps', label: 'Mini app', description: 'Các tiện ích của studio cho công việc làm nhạc, phụ đề và dựng MV.' },
  { id: 'resources', label: 'Tài nguyên', description: 'Cửa hàng & chia sẻ: Prompt Video 5s · Skill AI · 3D Blender.' },
  { id: 'contact', label: 'Liên hệ', description: 'Duy TTD Studio' },
];

const byId = id => document.getElementById(id);
const readData = (id, fallback) => {
  const source = byId(id);
  if (!source) return fallback;
  try { return JSON.parse(source.textContent); } catch { return fallback; }
};
const channels = readData('channel-data');
const details = readData('channel-details');
const publicVideos = readData('public-video-data');
const config = readData('site-config');
const chordData = readData('chords-data', {});
const resourceData = readData('resource-data', { items: [] });
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
    if (item.id === 'apps') panel.append(byId('apps-page').content.cloneNode(true));
    if (item.id === 'resources') panel.append(byId('resources-page').content.cloneNode(true));
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
const genreFilter = byId('genre-filter');
const artistNames = { duy: 'Duy TTD', xing: 'Xing', other: 'Du Ca', en: 'The Wayfaring Bard', zh: 'Người Hát Rong' };
const releaseLabels = { 'cong-khai': 'Đã phát hành', 'hen-gio': 'Đã hẹn giờ', 'sap-ra-mat': 'Sắp ra mắt' };
const excluded = title => ['nghich thien menh', 'dung dem duyen ra can do'].some(name => normalize(title).replace(/[^a-z0-9]+/g, ' ').includes(name));
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
const chordDialog = byId('chord-dialog');
const chordTitle = byId('chord-title');
const chordMeta = byId('chord-meta');
const chordBody = byId('chord-body');
let chordTrack;
let chordShift = 0;
let showingAll = false;


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
  return tracks.filter(track => normalize(track.title).includes(query)
    && (!genreFilter.value || track.genre === genreFilter.value));
}

const CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
function transposeChord(chord, shift) {
  chord = String(chord || '');
  const match = chord.replace(/♭/g, 'b').replace(/♯/g, '#').match(/^([A-G](?:#|b)?)([^/]*(?:\/\d+)?)(?:\/([A-G](?:#|b)?))?$/);
  if (!match) return String(chord || '');
  if (!/^(?:(?:maj|min|dim|aug|sus|add|omit|no|m|M|Δ)|[\d#b()+°ø/\-])*$/.test(match[2])) return chord;
  if (!Number.isInteger(shift) || shift === 0) return chord;
  const move = root => {
    const sharp = FLAT_TO_SHARP[root] || root;
    const at = CHORD_ROOTS.indexOf(sharp);
    return at < 0 ? root : CHORD_ROOTS[((at + shift) % 12 + 12) % 12];
  };
  return move(match[1]) + match[2] + (match[3] ? '/' + move(match[3]) : '');
}
function chordKey(title) { return normalize(title).replace(/[^a-z0-9]+/g, ' ').trim(); }
function getChord(track) {
  const rows = chordData && !Array.isArray(chordData) ? (chordData.bai || chordData) : {};
  const title = String(track?.title || '');
  const keys = [chordKey(title), chordKey(title.split('|')[0])];
  for (const key of keys) if (rows[key]) return rows[key];
  const short = keys[1];
  const match = Object.entries(rows).find(([key]) => short && (short.startsWith(key) || key.startsWith(short)));
  return match ? match[1] : null;
}
function renderChord() {
  const data = getChord(chordTrack);
  chordBody.replaceChildren();
  if (!data || data.nguon !== 'ky-am' || !Array.isArray(data.doan) || !data.doan.length) {
    chordBody.append(node('p', 'empty-state', 'Hợp âm đang được trích từ bản ký âm gốc của studio.'));
    return;
  }
  const vong = Array.isArray(data.vongChinh) ? data.vongChinh.map(chord => transposeChord(chord, chordShift)).join(' · ') : '';
  chordMeta.textContent = ['Tông: ' + (data.tong ? transposeChord(data.tong, chordShift) : '—'), 'Nhịp: ' + (data.nhip || '—'), 'Capo: ' + (data.capo ?? '—'), vong ? 'Vòng chính: ' + vong : ''].filter(Boolean).join(' · ');
  for (const section of Array.isArray(data.doan) ? data.doan : []) {
    const row = node('div', 'chord-section');
    row.append(node('h3', '', section.ten || 'Đoạn'), node('p', 'chord-line', transposeProgression(chordSectionText(section), chordShift) || '—'));
    chordBody.append(row);
  }
}
function openChords(track) {
  chordTrack = track; chordShift = 0; chordTitle.textContent = 'Hợp âm · ' + track.title;
  byId('chord-shift').textContent = 'Tông gốc'; renderChord();
  try { if (typeof chordDialog.showModal === 'function') chordDialog.showModal(); else chordDialog.setAttribute('open', ''); }
  catch { chordDialog.setAttribute('open', ''); }
}

function showTracks() {
  const matches = visibleTracks();
  const visible = showingAll || search.value || genreFilter.value ? matches : matches.slice(0, 5);
  grid.replaceChildren();
  byId('results-count').textContent = visible.length
    ? visible.length + ' / ' + matches.length + ' bài'
    : 'Không tìm thấy bài hát.';
  previous.disabled = next.disabled = shuffle.disabled = visible.length < 2;

  if (!visible.length) grid.append(node('p', 'empty-state', 'Không có MV khớp bộ lọc. Thử tên khác hoặc xóa bộ lọc.'));

  for (const track of visible) {
    const card = node('article', 'track-card');
    card.classList.toggle('is-current', track === selected);
    const art = node('div', 'track-art');
    setArtwork(art, track);
    const duration = node('span', 'track-duration', track.duration || '—:—');
    if (!track.duration) duration.title = 'Chưa có thời lượng';
    if (track.duration) art.append(duration);
    const badge = node('span', 'release-badge', releaseLabels[track.release] || releaseLabels['cong-khai']);
    badge.dataset.release = track.release || 'cong-khai';
    art.append(badge);

    const body = node('div', 'track-body');
    const action = button('button button-small' + (track === selected ? ' button-primary' : ' button-quiet'),
      videoId(track) ? '▶ Phát' : 'Chọn bài', () => selectTrack(track, true));
    action.setAttribute('aria-label', (videoId(track) ? 'Phát ' : 'Chọn ') + track.title);
    if (track === selected) action.setAttribute('aria-current', 'true');
    const chord = button('button button-small button-quiet', 'Hợp âm', () => openChords(track));
    chord.setAttribute('aria-label', 'Mở hợp âm ' + track.title);
    body.append(node('h3', '', track.title), node('p', 'track-meta', track.genre), action, chord);
    card.append(art, body);
    grid.append(card);
  }
  const toggle = byId('featured-toggle');
  if (toggle) { toggle.hidden = matches.length <= 5 || Boolean(search.value || genreFilter.value); toggle.textContent = showingAll ? 'Thu gọn về bài chủ lực' : 'Xem tất cả (' + matches.length + ' bài)'; }
}

function selectTrack(track, start = false) {
  stopVideo();
  selected = track;
  const id = videoId(track);
  const title = byId('selected-title');
  title.textContent = track?.title || 'Khám phá âm nhạc trên kênh';
  byId('selected-meta').textContent = track ? [track.genre, track.duration, releaseLabels[track.release]].filter(Boolean).join(' · ') : '';
  mediaCover.querySelector('img')?.remove();
  setArtwork(mediaCover, track);
  mediaCover.querySelector('.cover-caption').textContent = id ? 'Phát video' : releaseLabels[track?.release] || 'Mở kênh YouTube để nghe thêm';
  mediaCover.setAttribute('aria-label', id ? 'Phát ' + track.title : 'Danh sách đang cập nhật');
  mediaCover.disabled = play.disabled = listen.disabled = !id;
  watch.hidden = popup.hidden = !id;

  if (id) {
    watch.href = popup.href = watchUrl(id);
  } else {
    watch.removeAttribute('href');
    popup.removeAttribute('href');
    status.textContent = track ? 'MV ' + (releaseLabels[track.release] || 'đang cập nhật').toLowerCase() + '. Theo dõi kênh để đón xem.'
      : 'Danh sách đang cập nhật. Bạn có thể mở kênh YouTube để nghe nhạc.';
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
    && typeof video.tieuDe === 'string' && video.tieuDe.trim() && !excluded(video.tieuDe)).map(video => ({
    video: video.id, title: video.tieuDe, duration: video.thoiLuong || '', genre: video.theLoai || 'Chưa phân loại', release: 'cong-khai',
    tone: info.tone, chuLuc: Boolean(video.chuLuc || video.noiBat), views: Number(video.luotXem || 0) || 0,
  }));
  const existing = new Set(tracks.map(track => track.video));
  for (const mv of publicVideos.mv || []) {
    if (mv.caSi !== artistNames[id] || excluded(mv.bai) || existing.has(mv.videoId)) continue;
    if (!releaseLabels[mv.trangThai]) continue;
    tracks.push({ title: mv.bai, genre: mv.theLoai || 'Chưa phân loại',
      release: mv.trangThai, video: mv.trangThai === 'cong-khai' ? mv.videoId : '', tone: info.tone, chuLuc: Boolean(mv.chuLuc || mv.noiBat), views: Number(mv.luotXem || 0) || 0 });
  }
  tracks.sort((a, b) => Number(Boolean(b.chuLuc)) - Number(Boolean(a.chuLuc)) || b.views - a.views);
  genreFilter.replaceChildren(node('option', '', 'Tất cả thể loại'));
  genreFilter.firstElementChild.value = '';
  for (const genre of [...new Set(tracks.map(track => track.genre))].sort()) {
    const option = node('option', '', genre);
    option.value = genre;
    genreFilter.append(option);
  }
  channelPanel.setAttribute('aria-labelledby', 'channel-tabs-' + id);
  byId('channel-title').textContent = channel.name;
  byId('channel-style').textContent = info.style || 'Kênh YouTube';
  byId('channel-description').textContent = info.description || 'Khám phá âm nhạc từ kênh của Duy TTD Studio.';
  byId('channel-handle').textContent = channel.handle;
  byId('channel-link').href = baseYouTube + channel.handle;
  channelPanel.querySelector('.channel-hero').dataset.tone = info.tone || 'rose';
  byId('data-stamp').textContent = tracks.length ? tracks.length + ' MV trong danh mục' : 'Đang cập nhật';
  const readAt = new Date(data?.docLuc || '');
  byId('data-stamp').title = Number.isNaN(readAt.getTime()) ? '' : 'Cập nhật: ' + readAt.toLocaleString('vi-VN');
  search.value = '';
  showingAll = false;
  for (const card of byId('artist-grid').children) card.classList.toggle('is-active', card.dataset.artist === id);
  selectTrack(tracks[0]);
});

for (const info of channels) {
  addTab(channelTabs, { ...info, label: info.name }, channelPanel.id);
}
for (const id of ['duy', 'xing', 'other', 'en', 'zh']) {
  const info = channels.find(item => item.id === id);
  if (!info) continue;
  const card = node('article', 'artist-card');
  card.dataset.artist = id;
  const monogram = node('span', 'artist-monogram', { duy: 'D', xing: 'X', other: '杜', en: 'W', zh: 'R' }[id]);
  monogram.setAttribute('aria-hidden', 'true');
  const videos = publicVideos.channels?.find(item => item.id === id)?.videos || [];
  const titles = new Set(videos.filter(v => !excluded(v.tieuDe)).map(v => normalize(v.tieuDe.split('|')[0])));
  for (const mv of publicVideos.mv || []) if (mv.caSi === artistNames[id] && !excluded(mv.bai)) titles.add(normalize(mv.bai));
  const choose = button('artist-choose', artistNames[id], () => byId('channel-tabs-' + id).click());
  const link = node('a', 'artist-link', 'Mở kênh ↗');
  link.href = baseYouTube + info.handle;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  card.append(monogram, choose, node('p', 'artist-style', details.channels[id]?.style),
    node('p', 'artist-count', titles.size + ' ca khúc trong danh mục'), link);
  byId('artist-grid').append(card);
}
if (channelTabs.firstElementChild) selectChannel(channelTabs.firstElementChild);
else channelPanel.hidden = true;

const selectSite = tabs(siteTabs, id => {
  for (const [tabId, panel] of panels) panel.hidden = id !== tabId;
  if (id === 'apps') window.DuyKyAmWeb?.mount(panels.get(id));
  if (id !== 'youtube' && !frame.hidden) stopVideo();
});
selectSite(siteTabs.firstElementChild);

search.addEventListener('input', showTracks);
genreFilter.addEventListener('change', showTracks);
byId('clear-filters').addEventListener('click', () => {
  search.value = genreFilter.value = '';
  showTracks();
  search.focus();
});
byId('featured-toggle').addEventListener('click', () => { showingAll = !showingAll; showTracks(); });
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

byId('chord-close').addEventListener('click', () => { try { chordDialog.close(); } catch { chordDialog.removeAttribute('open'); } });
byId('chord-down').addEventListener('click', () => { chordShift = Math.max(-6, chordShift - 1); byId('chord-shift').textContent = chordShift ? (chordShift > 0 ? '+' : '') + chordShift + ' nửa cung' : 'Tông gốc'; renderChord(); });
byId('chord-up').addEventListener('click', () => { chordShift = Math.min(6, chordShift + 1); byId('chord-shift').textContent = chordShift ? '+' + chordShift + ' nửa cung' : 'Tông gốc'; renderChord(); });
byId('chord-reset').addEventListener('click', () => { chordShift = 0; byId('chord-shift').textContent = 'Tông gốc'; renderChord(); });
byId('chord-copy').addEventListener('click', async () => {
  const text = Array.from(chordBody.querySelectorAll('.chord-section')).map(section => section.textContent).join('\n');
  try { await navigator.clipboard.writeText(text); byId('chord-copy').textContent = 'Đã copy'; setTimeout(() => { byId('chord-copy').textContent = 'Copy hợp âm'; }, 1200); } catch { status.textContent = 'Không thể copy trên trình duyệt này.'; }
});

const resourceGrid = byId('resource-grid');
let resourceKind = 'all'; let resourcePrice = 'all';
const resourceItems = (() => {
  if (Array.isArray(resourceData.items)) return resourceData.items;
  if (!Array.isArray(resourceData.nhom)) return [];
  return resourceData.nhom.flatMap(group => (Array.isArray(group.muc) ? group.muc : []).map(item => ({
    ...item,
    nhom: group.id === 'prompt-video-5s' ? 'prompt' : group.id === 'skill-ai' ? 'skill' : 'blender',
    loai: String(item.loai || '').toLowerCase().startsWith('pro') ? 'pro' : 'free',
  })));
})();
// Clip minh hoạ 5s: chỉ nạp poster, rê chuột/focus thì phát (tắt tiếng, lặp, phát tại chỗ), bấm để bật/tắt.
const safeMediaPath = value => typeof value === 'string' && /^(?:https:\/\/|\.\/media\/)[^\s<>"'\\]+\.(?:mp4|webm|jpe?g|webp)$/i.test(value) && !value.includes('..');
function resourcePreview(item) {
  const preview = node('div', 'resource-preview');
  if (!safeMediaPath(item.preview.video)) {
    preview.setAttribute('aria-label', 'Minh họa 5 giây');
    preview.append(node('span', '', item.preview.fallback || 'Minh họa 5s đang cập nhật'));
    return preview;
  }
  const video = node('video');
  video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.preload = 'none';
  for (const name of ['muted', 'loop', 'playsinline']) video.setAttribute(name, '');
  video.setAttribute('preload', 'none'); video.setAttribute('disablepictureinpicture', ''); video.setAttribute('aria-hidden', 'true');
  if (safeMediaPath(item.preview.poster)) video.poster = item.preview.poster;
  video.src = item.preview.video;
  preview.classList.add('has-video'); preview.tabIndex = 0; preview.setAttribute('role', 'button');
  preview.setAttribute('aria-label', 'Phát minh họa 5 giây: ' + (item.tieuDe || 'Prompt Video'));
  preview.setAttribute('aria-pressed', 'false');
  const badge = node('span', 'resource-preview-badge', '▶ 5s');
  const setPlaying = playing => { preview.classList.toggle('is-playing', playing); preview.setAttribute('aria-pressed', String(playing)); badge.textContent = playing ? '❚❚ 5s' : '▶ 5s'; };
  const play = () => { setPlaying(true); try { const result = video.play(); if (result && typeof result.catch === 'function') result.catch(() => setPlaying(false)); } catch { setPlaying(false); } };
  const pause = () => { setPlaying(false); try { video.pause(); } catch {} };
  const toggle = () => (preview.classList.contains('is-playing') ? pause() : play());
  preview.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') play(); });
  preview.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') pause(); });
  preview.addEventListener('click', event => { event.preventDefault(); toggle(); });
  preview.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
  preview.addEventListener('blur', pause);
  preview.append(video, badge);
  return preview;
}
function renderResources() {
  if (!resourceGrid) return;
  resourceGrid.replaceChildren();
  const items = resourceItems.filter(item => (resourceKind === 'all' || item.nhom === resourceKind) && (resourcePrice === 'all' || item.loai === resourcePrice));
  for (const item of items) {
    const card = node('article', 'resource-card');
    card.dataset.kind = item.nhom;
    const title = node('h3', '', item.tieuDe || 'Tài nguyên');
    const badges = node('p', 'resource-badges', [item.engine, Array.isArray(item.nenTang) ? item.nenTang.join(' · ') : item.nenTang, Array.isArray(item.dinhDang) ? item.dinhDang.join(' · ') : item.dinhDang, item.thoiLuong, item.khung, item.loai === 'pro' ? 'Pro' : 'Miễn phí'].filter(Boolean).join(' · '));
    card.append(title, badges, node('p', 'resource-description', item.moTa || ''));
    if (item.nhom === 'skill') {
      const content = typeof item.noiDung === 'string' ? item.noiDung : '';
      const actions = node('div', 'skill-actions');
      const view = node('section', 'skill-view');
      view.hidden = true;
      const pre = node('pre', 'skill-source');
      pre.tabIndex = 0;
      pre.textContent = content;
      pre.setAttribute('aria-label', 'Nội dung SKILL.md');
      const feedback = node('p', 'skill-feedback');
      feedback.setAttribute('role', 'status');
      const quick = button('button button-primary', 'Xem nhanh SKILL.md', () => {
        view.hidden = !view.hidden;
        quick.setAttribute('aria-expanded', String(!view.hidden));
      });
      quick.setAttribute('aria-expanded', 'false');
      const copy = button('button button-quiet', 'Sao chép SKILL.md', async () => {
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
          else {
            // file:// hoặc trình duyệt cũ: sao chép ngay trong thao tác người dùng.
            const input = node('textarea', 'skill-copy-buffer');
            input.value = content; input.setAttribute('readonly', '');
            card.append(input); input.select();
            let copied;
            try { copied = document.execCommand('copy'); } finally { input.remove(); }
            if (!copied) throw new Error('copy unavailable');
          }
          feedback.textContent = 'Đã sao chép SKILL.md';
        } catch {
          view.hidden = false; quick.setAttribute('aria-expanded', 'true');
          feedback.textContent = 'Trình duyệt chặn sao chép. Chọn nội dung trong khung xem để sao chép thủ công.';
        }
      });
      actions.append(quick, copy);
      if (typeof item.tai === 'string' && /^\.\/skills-public\/[a-z0-9][a-z0-9-]{0,80}\.md$/.test(item.tai)) {
        const download = node('a', 'button button-quiet', 'Tải .md');
        download.href = item.tai; download.download = item.tai.split('/').pop();
        actions.append(download);
      }
      view.append(pre);
      card.append(actions, feedback, view);
      resourceGrid.append(card);
      continue;
    }
    if (item.nhom === 'prompt' && item.preview) card.append(resourcePreview(item));
    let action;
    if (item.loai === 'free' && item.prompt) {
      action = button('button button-primary', 'Copy prompt', async () => { try { await navigator.clipboard.writeText(item.prompt); action.textContent = 'Đã copy'; setTimeout(() => { action.textContent = 'Copy prompt'; }, 1200); } catch {} });
    } else {
      action = node('a', 'button button-primary', item.loai === 'pro' ? 'Liên hệ nhận gói' : item.nhom === 'blender' ? 'Tải mô hình' : 'Xem hướng dẫn');
      if (item.loai === 'pro') action.href = 'mailto:' + (config.publicEmail || 'contact@duyttdstudio.io.vn') + '?subject=' + encodeURIComponent(item.tieuDe || 'Tài nguyên');
      else if (item.nhom === 'skill' && /^https:\/\/duyttdstudio\.io\.vn\//i.test(item.huongDan || '')) action.href = item.huongDan;
      else if (item.nhom === 'blender' && /^assets\/[\w./-]+$/i.test(item.tai || '')) action.href = './' + item.tai;
      else { action.href = '#'; action.setAttribute('aria-disabled', 'true'); }
    }
    card.append(action); resourceGrid.append(card);
  }
}
for (const buttonEl of document.querySelectorAll('[data-resource-kind]')) buttonEl.addEventListener('click', () => { resourceKind = buttonEl.dataset.resourceKind; document.querySelectorAll('[data-resource-kind]').forEach(el => el.classList.toggle('button-primary', el === buttonEl)); renderResources(); });
for (const buttonEl of document.querySelectorAll('[data-resource-price]')) buttonEl.addEventListener('click', () => { resourcePrice = buttonEl.dataset.resourcePrice; document.querySelectorAll('[data-resource-price]').forEach(el => el.classList.toggle('button-primary', el === buttonEl)); renderResources(); });
renderResources();

// Mini apps: text/value only for user input; no upload, remote service or HTML parsing.
function transposeProgression(text, shift) {
  return String(text).split(/(\s+|[|,;·–—\[\]]+|-(?=[A-G]))/)
    .map(part => transposeChord(part, shift)).join('');
}

function chordSectionText(section) {
  return (Array.isArray(section.hopAm) ? section.hopAm : []).map(bar => {
    if (typeof bar === 'string') return bar;
    if (!bar || typeof bar !== 'object') return '—';
    const beats = Array.isArray(bar.theoPhach) ? bar.theoPhach : [];
    return beats.some(beat => typeof beat === 'string')
      ? beats.map(beat => typeof beat === 'string' ? beat : '—').join(' ')
      : (typeof bar.chinh === 'string' ? bar.chinh : '—');
  }).join(' | ');
}

const miniChordRows = Object.entries(chordData.bai || chordData).filter(([, row]) => row?.nguon === 'ky-am');
function filterMiniChords() {
  const query = normalize(byId('mini-chord-search').value);
  const select = byId('mini-chord-song');
  const matches = miniChordRows.filter(([key, row]) => normalize((row.ten || key.replace(/-/g, ' ')) + ' ' + (row.caSi || '')).includes(query));
  select.replaceChildren(node('option', '', 'Chọn bài để nạp hợp âm…'));
  select.firstElementChild.value = '';
  for (const [key, row] of matches) {
    const option = node('option', '', (row.ten || key.replace(/-/g, ' ')) + (row.caSi ? ' · ' + row.caSi : ''));
    option.value = key;
    select.append(option);
  }
  byId('mini-chord-info').textContent = matches.length + ' / ' + miniChordRows.length + ' bộ hợp âm ký âm thật. Chọn bài hoặc dán vòng riêng bên dưới.';
}
function updateMiniChords() {
  const shift = Number(byId('mini-chord-shift').value);
  byId('mini-shift-value').textContent = (shift > 0 ? '+' : '') + shift + ' nửa cung';
  byId('mini-chord-result').value = transposeProgression(byId('mini-chord-input').value, shift);
  byId('mini-copy-status').textContent = '';
}
byId('mini-chord-search').addEventListener('input', filterMiniChords);
byId('mini-chord-song').addEventListener('change', () => {
  const row = miniChordRows.find(([key]) => key === byId('mini-chord-song').value)?.[1];
  if (!row) return;
  const sections = (Array.isArray(row.doan) ? row.doan : []).map(chordSectionText);
  byId('mini-chord-input').value = (Array.isArray(row.vongChinh) && row.vongChinh.length ? [row.vongChinh.join(' | '), ...sections] : sections).join('\n');
  byId('mini-chord-shift').value = '0';
  updateMiniChords();
  byId('mini-chord-info').textContent = [row.ten, row.tong ? 'Tông gốc: ' + row.tong : '', row.nhip ? 'Nhịp: ' + row.nhip : '', 'Nguồn: ký âm studio'].filter(Boolean).join(' · ');
});
byId('mini-chord-input').addEventListener('input', updateMiniChords);
byId('mini-chord-shift').addEventListener('input', updateMiniChords);
byId('mini-chord-reset').addEventListener('click', () => { byId('mini-chord-shift').value = '0'; updateMiniChords(); });
byId('mini-chord-copy').addEventListener('click', async () => {
  const result = byId('mini-chord-result');
  if (!result.value.trim()) { byId('mini-copy-status').textContent = 'Chọn bài hoặc dán vòng hợp âm trước.'; return; }
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(result.value);
    else {
      result.focus(); result.select();
      if (typeof document.execCommand !== 'function' || !document.execCommand('copy')) throw new Error('copy');
    }
    byId('mini-copy-status').textContent = 'Đã copy hợp âm.';
  } catch {
    result.focus(); result.select();
    byId('mini-copy-status').textContent = 'Đã chọn hợp âm. Nhấn Ctrl+C (Mac: ⌘C) để copy.';
  }
});
filterMiniChords();

function subtitleTime(raw) {
  const match = String(raw).trim().match(/^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number('0.' + match[4]) : NaN;
}

function assSegments(text) {
  const segments = [];
  let elapsed = 0;
  let pending = null;
  // Drop ASS drawing instructions as well as style overrides; never interpret HTML.
  let drawing = false;
  for (const token of text.split(/(\{[^}]*\})/g)) {
    if (token.startsWith('{') && token.endsWith('}')) {
      const karaoke = token.match(/\\(?:kf|ko|k|K)(\d+)/);
      const draw = token.match(/\\p(\d+)/);
      if (draw) drawing = Number(draw[1]) > 0;
      if (karaoke) { pending = { offset: elapsed, duration: Number(karaoke[1]) / 100 }; elapsed += pending.duration; }
      continue;
    }
    if (!token || drawing) continue;
    segments.push({ text: token.replace(/\\[Nn]/g, '\n').replace(/\\h/g, '\u00a0'), ...(pending || {}) });
    pending = null;
  }
  return segments;
}

function parseSubtitles(input) {
  const cues = [];
  let invalid = 0;
  const text = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const add = (start, end, segments) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !segments.some(part => part.text.trim())) { invalid++; return; }
    cues.push({ start, end, segments });
  };
  if (/^\s*\[Events\]\s*$/im.test(text) || /^Dialogue:/im.test(text)) {
    let inEvents = !/^\s*\[Events\]\s*$/im.test(text);
    let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    for (const line of text.split('\n')) {
      if (/^\s*\[.*\]\s*$/.test(line)) { inEvents = /^\s*\[Events\]\s*$/i.test(line); continue; }
      if (!inEvents) continue;
      if (/^Format:/i.test(line)) { fields = line.slice(line.indexOf(':') + 1).split(',').map(field => field.trim().toLowerCase()); continue; }
      if (!/^Dialogue:/i.test(line)) continue;
      const parts = line.slice(line.indexOf(':') + 1).split(',');
      const at = fields.indexOf('text');
      if (at < 0 || !fields.includes('start') || !fields.includes('end') || parts.length < fields.length) { invalid++; continue; }
      const tail = fields.length - at - 1;
      const values = [...parts.slice(0, at), parts.slice(at, parts.length - tail).join(','), ...(tail ? parts.slice(-tail) : [])];
      add(subtitleTime(values[fields.indexOf('start')]), subtitleTime(values[fields.indexOf('end')]), assSegments(values[at]));
    }
  } else {
    for (const block of text.split(/\n[ \t]*\n/)) {
      if (!block.trim()) continue;
      const lines = block.trim().split('\n');
      const index = lines.findIndex(line => line.includes('-->'));
      const match = index >= 0 && lines[index].match(/^\s*(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/);
      if (!match) { invalid++; continue; }
      // Display the source literally, including any markup, to avoid changing the user's text.
      add(subtitleTime(match[1]), subtitleTime(match[2]), [{ text: lines.slice(index + 1).join('\n') }]);
    }
  }
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  let latestEnd = -1;
  let overlaps = 0;
  for (const cue of cues) { if (cue.start < latestEnd) overlaps++; latestEnd = Math.max(latestEnd, cue.end); }
  return { cues, invalid, overlaps };
}

let miniCues = [];
let miniAudioUrl = '';
let subtitleReadVersion = 0;
let karaokeFrame = 0;
const miniAudio = byId('mini-audio');
function renderMiniKaraoke() {
  const now = miniAudio.currentTime || 0;
  const screen = byId('mini-karaoke-text');
  const active = miniCues.filter(cue => cue.start <= now && now < cue.end);
  screen.replaceChildren();
  if (!active.length) { screen.textContent = miniCues.length ? '♪' : 'Nạp phụ đề, chọn nhạc rồi bấm phát.'; return; }
  for (const cue of active) {
    const line = node('div', 'karaoke-line');
    for (const part of cue.segments) {
      const elapsed = now - cue.start - (part.offset || 0);
      const syllable = node('span', part.duration === undefined ? 'karaoke-active' : 'karaoke-syllable', part.text);
      if (part.duration !== undefined) {
        const progress = Math.max(0, Math.min(1, part.duration > 0 ? elapsed / part.duration : elapsed >= 0 ? 1 : 0));
        syllable.style.setProperty('--karaoke-progress', (progress * 100).toFixed(2) + '%');
      }
      line.append(syllable);
    }
    screen.append(line);
  }
}
function loadMiniSubtitles() {
  const input = byId('mini-sub-input').value;
  if (input.length > 2000000) { byId('mini-sub-status').textContent = 'Phụ đề quá lớn (tối đa 2 MB).'; return; }
  const result = parseSubtitles(input);
  miniCues = result.cues;
  byId('mini-sub-status').textContent = miniCues.length + ' câu đã nạp. '
    + (result.overlaps ? 'Cảnh báo: ' + result.overlaps + ' câu chồng giờ. ' : 'Không có câu chồng giờ. ')
    + (result.invalid ? result.invalid + ' mục sai định dạng hoặc thời gian đã bỏ qua.' : '')
    + (!miniCues.length ? ' Hãy dán SRT/ASS hợp lệ.' : '');
  renderMiniKaraoke();
}
async function readMiniSubtitle(file) {
  const version = ++subtitleReadVersion;
  if (!file) return;
  if (!/\.(srt|ass)$/i.test(file.name) || file.size > 2000000) {
    byId('mini-sub-status').textContent = 'Chỉ nhận file .srt / .ass tối đa 2 MB.'; return;
  }
  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsText(file, 'UTF-8');
    });
    if (version !== subtitleReadVersion) return;
    byId('mini-sub-input').value = text;
    loadMiniSubtitles();
  } catch { if (version === subtitleReadVersion) byId('mini-sub-status').textContent = 'Không đọc được file. Hãy thử dán phụ đề.'; }
}
byId('mini-sub-file').addEventListener('change', event => readMiniSubtitle(event.target.files?.[0]));
byId('mini-sub-input').addEventListener('input', () => { subtitleReadVersion++; loadMiniSubtitles(); });
byId('mini-sub-load').addEventListener('click', () => { subtitleReadVersion++; loadMiniSubtitles(); });
byId('mini-sub-input').addEventListener('dragover', event => { event.preventDefault(); });
byId('mini-sub-input').addEventListener('drop', event => { event.preventDefault(); readMiniSubtitle(event.dataTransfer?.files?.[0]); });
byId('mini-audio-file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name)) {
    byId('mini-audio-status').textContent = 'Hãy chọn file nhạc.'; return;
  }
  try {
    const nextUrl = URL.createObjectURL(file);
    if (miniAudioUrl) URL.revokeObjectURL(miniAudioUrl);
    miniAudioUrl = nextUrl;
    miniAudio.src = nextUrl;
    byId('mini-audio-status').textContent = 'Đã chọn nhạc cục bộ. Bấm phát để xem phụ đề.';
  } catch { byId('mini-audio-status').textContent = 'Trình duyệt chưa mở được file nhạc này.'; }
});
miniAudio.addEventListener('error', () => { byId('mini-audio-status').textContent = 'Không phát được định dạng nhạc này. Thử MP3 hoặc WAV.'; });
for (const event of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'ended']) miniAudio.addEventListener(event, renderMiniKaraoke);
function stopKaraokeFrame() { if (karaokeFrame) cancelAnimationFrame(karaokeFrame); karaokeFrame = 0; }
function animateMiniKaraoke() {
  renderMiniKaraoke();
  karaokeFrame = !miniAudio.paused && !miniAudio.ended ? requestAnimationFrame(animateMiniKaraoke) : 0;
}
miniAudio.addEventListener('play', () => { stopKaraokeFrame(); if (typeof requestAnimationFrame === 'function') animateMiniKaraoke(); });
miniAudio.addEventListener('pause', () => { stopKaraokeFrame(); renderMiniKaraoke(); });
window.addEventListener('pagehide', () => { stopKaraokeFrame(); if (miniAudioUrl) { URL.revokeObjectURL(miniAudioUrl); miniAudioUrl = ''; miniAudio.removeAttribute('src'); } });

function parseSongDuration(value) {
  const raw = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+):([0-5]\d(?:\.\d+)?)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}
function trailerWindows(duration, length, bpm) {
  if (!Number.isFinite(duration) || duration < length || ![15, 20, 25].includes(length)) return [];
  const bar = Number.isFinite(bpm) && bpm >= 20 && bpm <= 400 ? 240 / bpm : 0;
  const starts = new Set();
  return [0.5, 0.65, 0.8].flatMap(ratio => {
    let start = Math.max(0, Math.min(duration - length, duration * ratio));
    if (bar) start = Math.floor(start / bar) * bar;
    start = Math.round(start * 1000) / 1000;
    if (starts.has(start)) return [];
    starts.add(start);
    return [{ start, end: Math.round((start + length) * 1000) / 1000 }];
  });
}
function miniTimestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}
function updateMiniTrailer() {
  const duration = parseSongDuration(byId('mini-song-duration').value);
  const bpmInput = byId('mini-bpm-input').value;
  const bpm = Number(bpmInput);
  const length = Number(byId('mini-trailer-duration').value);
  const list = byId('mini-trailer-results'); list.replaceChildren();
  if (bpmInput && (!Number.isFinite(bpm) || bpm < 20 || bpm > 400)) { byId('mini-trailer-status').textContent = 'BPM phải từ 20 đến 400.'; return; }
  const windows = trailerWindows(duration, length, bpm);
  byId('mini-trailer-status').textContent = windows.length ? (bpmInput ? 'Đã căn điểm đầu theo ô nhịp 4/4.' : 'Nhập BPM hoặc bấm Tap để căn ô nhịp.') : 'Nhập độ dài bài hợp lệ, ít nhất bằng độ dài trailer.';
  for (const item of windows) list.append(node('li', '', miniTimestamp(item.start) + ' → ' + miniTimestamp(item.end) + ' · ' + length + 's · 16:9'));
}
let miniTaps = [];
byId('mini-tap').addEventListener('click', () => {
  const now = performance.now();
  const previous = miniTaps[miniTaps.length - 1];
  if (previous !== undefined && now - previous < 100) return;
  if (previous !== undefined && now - previous > 3000) miniTaps = [];
  miniTaps.push(now); miniTaps = miniTaps.slice(-9);
  if (miniTaps.length < 2) { byId('mini-bpm').textContent = 'Bấm tiếp nhịp thứ hai…'; return; }
  const bpm = 60000 * (miniTaps.length - 1) / (now - miniTaps[0]);
  byId('mini-bpm').textContent = bpm.toFixed(1) + ' BPM · ' + miniTaps.length + ' nhịp';
  byId('mini-bpm-input').value = bpm.toFixed(1);
  updateMiniTrailer();
});
byId('mini-tap-reset').addEventListener('click', () => { miniTaps = []; byId('mini-bpm').textContent = '— BPM'; byId('mini-bpm-input').value = ''; updateMiniTrailer(); });
for (const id of ['mini-song-duration', 'mini-trailer-duration', 'mini-bpm-input']) byId(id).addEventListener('input', updateMiniTrailer);
byId('mini-open-resources').addEventListener('click', () => openTab('resources'));

(() => {
  'use strict';
  const merchants = window.CAMPUS_MERCHANTS;
  const menuFraming = window.CAMPUS_MENU_FRAMING || {};
  const campusMap = window.CAMPUS_MAP;
  const app = document.querySelector('#app');
  if (!Array.isArray(merchants) || merchants.length === 0) {
    app.innerHTML = '<p class="pending-note">互动查询暂未加载，请刷新重试。下方仍可展开查看商家资料。</p>';
    return;
  }
  document.querySelector('#static-directory')?.setAttribute('hidden', '');
  const areas = [
    { id: 'all', name: '全部商家', short: '全部', icon: 'grid', location: '' },
    { id: 'hongqiao', name: '虹桥学生中心', short: '虹桥学生中心', icon: 'shop', location: '西区 · 地上两层、地下一层' },
    { id: 'jinqiao', name: '金桥餐厅', short: '金桥餐厅', icon: 'shop', location: '南区 · 邻近宿舍楼与教学楼' }
  ];
  const floorNames = { B1: '负一楼', '1F': '一楼', '2F': '二楼' };
  const categoryOrder = ['面食', '米饭简餐', '粉与米线', '香锅冒菜', '快餐小炒', '锅物砂锅', '早餐小吃', '汉堡炸鸡', '饮品零食', '其他'];
  const categories = [...new Set(merchants.map(m => m.category))].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));
  let filters = { area: 'all', floor: 'all', category: 'all', q: '' };
  let lastListHash = '#/';
  let listScroll = 0;
  let currentMerchant = null;
  let previousView = null;
  let detailFromList = false;
  let photoIndex = 0;
  let photoZoom = 1;
  let photoBaseWidth = 0;
  let toastTimer;
  let searchTimer;
  let mapArea = 'hongqiao';
  let mapZoom = 1;
  let lastMapReturnHash = '#/';
  let mapFromPage = false;
  let mapDetailFromList = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s·・.，,、\/（）()\-]/g, '');
  const index = new Map(merchants.map(m => [m.id, normalize([m.name, ...(m.aliases || []), m.category, m.areaName, m.location, ...m.specialties, ...m.dishes.map(d => d.name)].join(' '))]));
  const money = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  const count = area => merchants.filter(m => area === 'all' || m.area === area).length;
  const defaultFilters = () => ({ area: 'all', floor: 'all', category: 'all', q: '' });
  const placeholder = (classes = 'merchant-photo') => `<div class="${classes} photo-placeholder" role="img" aria-label="商家照片待补充">${icon('shop')}<span>照片待补充</span></div>`;
  const image = (m, classes = 'merchant-photo', eager = false) => m.image ? (m.photoLayout === 'combined'
    ? `<div class="${classes} combined-photo">${menuImage(m.image, `${m.name}招牌与窗口实拍`, eager)}</div>`
    : `<img class="${classes}" src="${esc(m.image)}" alt="${esc(m.name)}门店实拍" loading="${eager ? 'eager' : 'lazy'}" decoding="async" style="object-position:${esc(m.imagePosition || '50% 25%')}" data-merchant-image>`) : placeholder(classes);
  function menuImage(src, alt, eager = false) {
    const framing = menuFraming[src];
    if (!framing) return `<div class="menu-crop menu-crop-unframed"><img src="${esc(src)}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></div>`;
    const rect = framing?.crop || [0, 0, framing?.width || 1, framing?.height || 1];
    const [x, y, width, height] = rect;
    const sourceWidth = framing?.width || width;
    const ratio = width / height;
    return `<div class="menu-crop" style="--menu-ratio:${ratio};--menu-image-width:${sourceWidth / width * 100}%;--menu-image-left:${-x / width * 100}%;--menu-image-top:${-y / height * 100}%"><img src="${esc(src)}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></div>`;
  }
  const isFiltered = () => filters.area !== 'all' || filters.floor !== 'all' || filters.category !== 'all' || filters.q !== '';

  function getHash() {
    const params = new URLSearchParams();
    if (filters.area !== 'all') params.set('area', filters.area);
    if (filters.floor !== 'all') params.set('floor', filters.floor);
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.q) params.set('q', filters.q);
    return '#/' + (params.size ? '?' + params.toString() : '');
  }

  function readFilters(hash) {
    const p = new URLSearchParams(hash.split('?')[1] || '');
    return {
      area: areas.some(a => a.id === p.get('area')) ? p.get('area') : 'all',
      floor: Object.hasOwn(floorNames, p.get('floor')) ? p.get('floor') : 'all',
      category: categories.includes(p.get('category')) ? p.get('category') : 'all',
      q: (p.get('q') || '').slice(0, 80)
    };
  }

  function filteredMerchants() {
    const query = normalize(filters.q);
    return merchants.filter(m => (filters.area === 'all' || m.area === filters.area) && (filters.floor === 'all' || m.floor === filters.floor) && (filters.category === 'all' || m.category === filters.category) && (!query || index.get(m.id).includes(query)));
  }

  function renderNav(mapActive = false) {
    document.querySelector('#area-nav').innerHTML = areas.map(a => `<button class="area-button" data-area="${a.id}" aria-current="${!mapActive && filters.area === a.id}">${icon(a.icon)}<span>${a.name}</span><span class="area-count">${count(a.id)}</span></button>`).join('') + `<button class="area-button map-nav-button" data-action="map" aria-current="${mapActive}">${icon('pin')}<span>校园地图</span></button>`;
  }

  function renderMap(area = 'hongqiao', zoom = 1, keepScroll = false) {
    currentMerchant = null;
    previousView = 'map';
    document.title = '校园餐饮地图 · 欧亚食光';
    renderNav(true);
    if (!campusMap) {
      app.innerHTML = '<div class="empty-state"><h1>校园地图暂未加载</h1><p>请刷新重试，或返回商家列表查看文字位置。</p><a class="primary-button" href="#/">返回商家列表</a></div>';
      return;
    }
    mapArea = campusMap.points.some(p => p.id === area) ? area : 'hongqiao';
    mapZoom = zoom;
    const selected = campusMap.points.find(p => p.id === mapArea);
    const pageScroll = keepScroll ? window.scrollY : 0;
    app.innerHTML = `<div class="detail-tools"><button class="text-button back-button" data-action="map-back">${icon('back')}${lastMapReturnHash.startsWith('#/merchant/') ? '返回商家详情' : '返回商家列表'}</button><a class="text-button" href="${esc(campusMap.asset)}" target="_blank" rel="noopener">查看完整原图 ${icon('photo')}</a></div>
      <div class="page-heading"><div><h1>校园餐饮地图</h1><p>彩色线路为报到路线，餐厅已另作标记。</p></div></div>
      <div class="map-toolbar"><div class="map-area-switch" aria-label="在地图中选择餐厅">${campusMap.points.map(p => `<button data-map-select="${p.id}" aria-pressed="${p.id === mapArea}">${esc(p.name)}</button>`).join('')}</div><div class="map-zoom-controls" aria-label="地图缩放"><button class="icon-button" data-map-zoom="out" aria-label="缩小地图">${icon('minus')}</button><span id="map-zoom-status" aria-live="polite"></span><button class="icon-button" data-map-zoom="in" aria-label="放大地图">${icon('plus')}</button><button class="text-button" data-map-zoom="fit">全图</button></div></div>
      <div class="campus-map-stage" id="campus-map-stage" tabindex="0" role="region" aria-label="校园地图，可放大并滚动查看"><div class="campus-map-board" id="campus-map-board" style="aspect-ratio:${campusMap.width}/${campusMap.height}"><img src="${esc(campusMap.asset)}" alt="学校2026级新生报到地图" width="${campusMap.width}" height="${campusMap.height}">
      ${campusMap.points.map((p, i) => `<div class="map-building ${p.id === mapArea ? 'selected' : ''}" aria-hidden="true" style="left:${(p.bounds.x - 4) / campusMap.width * 100}%;top:${(p.bounds.y - 4) / campusMap.height * 100}%;width:${(p.bounds.width + 8) / campusMap.width * 100}%;height:${(p.bounds.height + 8) / campusMap.height * 100}%"></div><button class="map-pin ${p.id === mapArea ? 'selected' : ''}" style="left:${p.center.x / campusMap.width * 100}%;top:${p.center.y / campusMap.height * 100}%" data-map-select="${p.id}" aria-label="定位${esc(p.name)}" aria-pressed="${p.id === mapArea}"><span class="map-pin-dot">${i + 1}</span><span class="map-pin-label">${esc(p.name)}</span></button>`).join('')}</div></div>
      <div class="map-location-card"><div><h2>${esc(selected.name)}</h2><p>${esc(selected.locationNote)}</p><span>${esc(areas.find(a => a.id === mapArea).location)} · ${count(mapArea)}家商家</span></div><a class="outline-button" href="#/?area=${mapArea}">查看这里的商家 ${icon('arrow')}</a></div>
      <p class="pending-note">${icon('info')}<span>底图：${esc(campusMap.title)}。彩色线路为新生报到路线；餐厅标记用于校园方位参考。</span></p>`;
    updateMapViewport(zoom > 1);
    window.scrollTo(0, pageScroll);
  }

  function updateMapViewport(centerOnSelected = false) {
    const stage = document.querySelector('#campus-map-stage');
    const board = document.querySelector('#campus-map-board');
    if (!stage || !board || !campusMap) return;
    const fitWidth = Math.min(stage.clientWidth - 24, (stage.clientHeight - 24) * campusMap.width / campusMap.height);
    const width = fitWidth * mapZoom;
    board.style.width = `${width}px`;
    stage.classList.toggle('map-is-zoomed', mapZoom > 1);
    document.querySelector('#map-zoom-status').textContent = `${mapZoom}×`;
    document.querySelector('[data-map-zoom="out"]').disabled = mapZoom === 1;
    document.querySelector('[data-map-zoom="in"]').disabled = mapZoom === 3;
    if (centerOnSelected && mapZoom > 1) {
      const selected = campusMap.points.find(p => p.id === mapArea);
      stage.scrollLeft = 12 + selected.center.x / campusMap.width * width - stage.clientWidth / 2;
      stage.scrollTop = 12 + selected.center.y / campusMap.width * width - stage.clientHeight / 2;
    } else {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
  }

  function card(m) {
    const priced = m.dishes.filter(d => typeof d.price === 'number');
    const price = priced.length ? `<span class="merchant-price">已录入菜价 <strong>¥${money(Math.min(...priced.map(d => d.price)))}</strong>起</span>` : '<span>价格待补充</span>';
    return `<a class="merchant-card ${m.area === 'jinqiao' ? 'merchant-card-landscape' : ''}" href="#/merchant/${encodeURIComponent(m.id)}" data-card="${esc(m.id)}" aria-label="查看${esc(m.name)}详情">
      ${image(m)}<div class="merchant-copy"><div class="merchant-title"><h3>${esc(m.name)}</h3>${icon('arrow').replace('class="icon"', 'class="icon card-chevron"')}</div>
      <div class="merchant-category">${esc(m.category)}</div><p class="merchant-specialty">${esc(m.specialties.length ? m.specialties.join(' · ') : '主营待补充')}</p>
      <p class="merchant-location">${esc(m.location)}</p><div class="merchant-meta">${price}<span>${m.hours ? esc(m.hours) : '时间待补充'}</span></div></div></a>`;
  }

  function resultMarkup() {
    const matched = filteredMerchants();
    const title = filters.q ? '搜索结果' : (filters.area === 'all' ? '全部商家' : areas.find(a => a.id === filters.area).name);
    const summary = [filters.q ? `关键词“${filters.q}”` : '', filters.floor !== 'all' ? floorNames[filters.floor] : '', filters.category !== 'all' ? filters.category : ''].filter(Boolean);
    const groups = areas.filter(a => a.id !== 'all').map(a => {
      const rows = matched.filter(m => m.area === a.id);
      return rows.length ? `<section class="area-group" aria-label="${a.name}商家"><div class="group-heading">${icon('pin')}<b>${a.name}</b><span>${a.location.split(' · ')[0]} · ${rows.length}家</span><span class="group-line"></span></div><div class="merchant-grid">${rows.map(card).join('')}</div></section>` : '';
    }).join('');
    return `<div class="results-line"><h2>${title}</h2><div class="results-actions"><button class="reset-button" data-action="reset" ${isFiltered() ? '' : 'hidden'}>重置筛选</button><span class="result-count" role="status" aria-live="polite">共 <b>${matched.length}</b> 家商家</span></div></div>${summary.length ? `<p class="filter-summary">${esc(summary.join(' · '))}</p>` : ''}${matched.length ? groups : `<div class="empty-state">${icon('search')}<h2>没有找到匹配的商家</h2><p>试试更短的关键词，或清空餐厅、楼层与品类筛选。</p><button class="primary-button" data-action="reset">清空筛选，查看全部</button></div>`}
      <p class="pending-note">${icon('info')}<span>资料持续补充中。${merchants.filter(m => m.area === 'jinqiao' && !m.image).length ? `金桥仍有${merchants.filter(m => m.area === 'jinqiao' && !m.image).length}家照片待补充；` : ''}没有依据的价格和营业时间均标注“待补充”。</span></p>`;
  }

  function renderList(restore = false) {
    currentMerchant = null;
    document.title = '欧亚食光 · 校园餐饮指南';
    renderNav();
    app.innerHTML = `<div class="page-heading"><div><h1>校园餐饮</h1><p>找一家合口味的，也认一认去它的路。</p></div><div class="collection-note"><strong>${merchants.length}家校园商家</strong><br>虹桥学生中心 · 金桥餐厅</div></div>
      <form class="search-form" role="search" id="search-form">${icon('search')}<input type="search" id="search" name="q" aria-label="搜索商家、菜品或品类" placeholder="搜商家、菜品或品类" maxlength="80" value="${esc(filters.q)}" autocomplete="off" enterkeyhint="search"><button class="icon-button" id="clear-search" type="button" aria-label="清空搜索" ${filters.q ? '' : 'hidden'}>${icon('close')}</button><span class="search-shortcut" aria-hidden="true">/</span></form>
      <section class="browse-controls" aria-label="商家筛选"><div class="mobile-areas" aria-label="选择餐厅">${areas.map(a => `<button data-area="${a.id}" aria-pressed="${filters.area === a.id}"><span class="area-name">${a.short}</span><span class="area-number">${count(a.id)}</span></button>`).join('')}</div>
      <div class="filter-row"><label class="select-wrap"><span>楼层</span><select id="floor-select" aria-label="按楼层筛选"><option value="all">全部楼层</option>${Object.entries(floorNames).map(([id, name]) => `<option value="${id}" ${filters.floor === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label class="select-wrap"><span>餐饮品类</span><select id="category-select" aria-label="按餐饮品类筛选"><option value="all">全部品类</option>${categories.map(c => `<option ${filters.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div></section><div id="results">${resultMarkup()}</div>`;
    if (filters.area === 'jinqiao') {
      const option = app.querySelector('#floor-select option[value="B1"]');
      if (option) option.remove();
    }
    document.querySelector('#search').addEventListener('input', event => {
      clearTimeout(searchTimer);
      filters.q = event.target.value.trim().slice(0, 80);
      document.querySelector('#clear-search').hidden = !event.target.value;
      document.querySelector('.reset-button').hidden = !isFiltered();
      searchTimer = setTimeout(() => {
        document.querySelector('#results').innerHTML = resultMarkup();
        history.replaceState(null, '', getHash());
        lastListHash = getHash();
      }, 100);
    });
    document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); document.querySelector('#search').blur(); });
    document.querySelector('#clear-search').addEventListener('click', () => {
      clearTimeout(searchTimer);
      filters.q = '';
      history.replaceState(null, '', getHash());
      lastListHash = getHash();
      listScroll = window.scrollY;
      renderList(true);
      document.querySelector('#search').focus();
    });
    for (const [id, field] of [['floor-select', 'floor'], ['category-select', 'category']]) {
      document.getElementById(id).addEventListener('change', event => { filters[field] = event.target.value; setListHash(); });
    }
    if (restore) requestAnimationFrame(() => window.scrollTo(0, listScroll));
  }

  function renderDetail(m) {
    currentMerchant = m;
    document.title = `${m.name} · 欧亚食光`;
    renderNav();
    const dataNotes = m.notes.filter(n => !n.includes('已录入部分清晰菜单'));
    const dishes = m.dishes.length ? m.dishes : m.specialties.length ? m.specialties.map(name => ({ name, price: null, unit: '份' })) : [{ name: '菜品信息待补充', price: null }];
    app.innerHTML = `<div class="detail-tools"><button class="text-button back-button" data-action="back">${icon('back')}返回商家列表</button><button class="text-button" data-action="share">${icon('share')}分享商家</button></div>
      <div class="detail-top ${m.photoLayout === 'combined' ? 'detail-top-combined' : ''}">${image(m, 'detail-cover', true)}<div class="detail-top-info"><h1>${esc(m.name)}</h1><div class="detail-tags"><span>${esc(m.areaName)}</span><span>${floorNames[m.floor]}</span><span class="category">${esc(m.category)}</span></div>${m.aliases?.length ? `<p class="detail-alias">招牌店名：${esc(m.aliases.join('、'))}</p>` : ''}<p class="detail-specialty">${m.specialties.length ? '主营：' + esc(m.specialties.join('、')) : '主营信息待补充'}</p></div></div>
      <div class="detail-columns"><div><section class="detail-section"><div class="section-header"><h2>菜品与价格</h2><span>${m.dishes.length ? '已录入部分菜单' : '菜价待补充'}</span></div><table class="menu-table"><thead><tr><th scope="col">菜品 / 规格</th><th scope="col" class="price-col">价格</th></tr></thead><tbody>${dishes.map(d => `<tr><td>${esc(d.name)}</td><td class="price-col ${typeof d.price === 'number' ? '' : 'pending-value'}">${typeof d.price === 'number' ? `¥${money(d.price)}<span class="price-unit"> / ${esc(d.unit || '份')}</span>` : '待补充'}</td></tr>`).join('')}</tbody></table><p class="menu-caption">${m.dishes.length ? '价格及规格按已有菜单实拍整理，仅代表已录入菜品，不作为人均消费。完整供应与最新价格以门店为准。' : '先展示已有主营信息，具体菜品、规格与价格将在取得依据后补充。'}</p></section>
      <section class="detail-section"><div class="section-header"><h2>菜单实拍</h2><span>${m.menuImages.length ? '点击查看大图' : '照片待补充'}</span></div>${m.menuImages.length ? `<div class="menu-gallery" data-count="${m.menuImages.length}">${m.menuImages.map((src, i) => `<button class="menu-thumb" data-photo="${i}" aria-label="放大${esc(m.name)}菜单照片${i + 1}"><div class="menu-preview">${menuImage(src, `${m.name}菜单实拍${i + 1}`)}</div><span>${esc(menuFraming[src]?.label || `菜单 ${i + 1}`)}${icon('photo')}</span></button>`).join('')}</div>` : '<p class="menu-missing">菜单照片待补充。现有商家文字资料可正常查看。</p>'}</section></div>
      <aside class="info-panel" aria-label="商家位置与营业时间"><h2>到店信息</h2><div class="info-block location-block"><div class="info-label">${icon('pin')}商家位置</div><div class="info-value"><span class="floor-chip">${floorNames[m.floor]}</span>${esc(m.areaName)}</div><p class="info-sub">${esc(areas.find(a => a.id === m.area).location)}</p><p class="info-value" style="margin-top:10px">${esc(m.location)}</p>${dataNotes.filter(n => /位置|第二|核实/.test(n)).map(n => `<p class="location-note">${esc(n)}</p>`).join('')}<div class="floor-guide">${(m.area === 'hongqiao' ? ['B1', '1F', '2F'] : ['1F', '2F']).map(f => `<span class="${f === m.floor ? 'current' : ''}">${floorNames[f]}</span>`).join('')}</div><button class="map-location-link" data-action="map" data-map-area="${m.area}">${icon('pin')}在校园地图中查看</button></div><div class="info-block"><div class="info-label">${icon('clock')}营业时间</div><p class="info-value">${m.hours ? esc(m.hours) : '待补充'}</p><p class="info-sub">${m.hours ? '营业安排以门店为准' : '暂无可靠时间信息'}</p></div><div class="info-block"><div class="info-label">${icon('shop')}餐饮品类</div><p class="info-value">${esc(m.category)}</p></div></aside></div>
      ${dataNotes.filter(n => !/位置|第二|核实/.test(n)).map(n => `<p class="pending-note">${icon('info')}<span>${esc(n)}</span></p>`).join('')}<p class="detail-bottom">资料整理于2026年10月28日。未确认的信息保留“待补充”，实际菜品、价格与营业安排以门店为准。</p>`;
    window.scrollTo(0, 0);
  }

  function setListHash() {
    clearTimeout(searchTimer);
    const hash = getHash();
    listScroll = 0;
    if (location.hash === hash) renderList();
    else location.hash = hash;
  }

  function route() {
    clearTimeout(searchTimer);
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    const hash = location.hash || '#/';
    if (hash.startsWith('#/map')) {
      const params = new URLSearchParams(hash.split('?')[1] || '');
      renderMap(params.get('area') || 'hongqiao');
      return;
    }
    const match = hash.match(/^#\/merchant\/([^/?]+)/);
    if (match) {
      detailFromList = previousView === 'map' && hash === lastMapReturnHash ? mapDetailFromList : previousView === 'list';
      previousView = 'detail';
      const m = merchants.find(row => row.id === match[1]);
      if (m) renderDetail(m);
      else {
        app.innerHTML = `<div class="empty-state"><h1>暂未找到这家商家</h1><p>商家链接可能有误，返回列表继续查找。</p><a class="primary-button" href="#/">查看全部商家</a></div>`;
        renderNav();
      }
    } else {
      previousView = 'list';
      filters = readFilters(hash);
      if (filters.area === 'jinqiao' && filters.floor === 'B1') filters.floor = 'all';
      lastListHash = getHash();
      renderList(true);
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function showPhoto(i) {
    if (!currentMerchant || !currentMerchant.menuImages.length) return;
    photoIndex = i;
    const src = currentMerchant.menuImages[i];
    document.querySelector('#large-photo-frame').innerHTML = menuImage(src, `${currentMerchant.name}菜单实拍，第${i + 1}张`, true);
    document.querySelector('#photo-caption').textContent = `${currentMerchant.name} · ${menuFraming[src]?.label || '菜单'} ${i + 1} / ${currentMerchant.menuImages.length}`;
    document.querySelector('#original-photo').href = src.split('#')[0];
    document.querySelector('#prev-photo').disabled = i === 0;
    document.querySelector('#next-photo').disabled = i === currentMerchant.menuImages.length - 1;
    const dialog = document.querySelector('#photo-dialog');
    if (!dialog.open) dialog.showModal();
    resetPhotoZoom();
  }

  function resetPhotoZoom() {
    const stage = document.querySelector('#large-photo-frame');
    photoZoom = 1;
    stage.classList.remove('is-zoomed');
    stage.style.removeProperty('--zoom-width');
    stage.tabIndex = -1;
    stage.setAttribute('aria-label', '菜单图片');
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    photoBaseWidth = stage.querySelector('.menu-crop')?.getBoundingClientRect().width || 0;
    document.querySelector('#zoom-photo').textContent = '放大 2×';
    document.querySelector('#zoom-photo').setAttribute('aria-label', '放大菜单至2倍');
  }

  document.addEventListener('click', async event => {
    if (event.target.closest('.skip-link')) {
      event.preventDefault();
      const main = document.querySelector('#main');
      main.focus();
      main.scrollIntoView();
      return;
    }
    const mapSelect = event.target.closest('[data-map-select]');
    if (mapSelect) {
      const selected = mapSelect.dataset.mapSelect;
      history.replaceState(null, '', `#/map?area=${selected}`);
      renderMap(selected, Math.max(2, mapZoom), true);
      document.querySelector('#campus-map-stage').focus({ preventScroll: true });
      return;
    }
    const mapZoomAction = event.target.closest('[data-map-zoom]');
    if (mapZoomAction) {
      const action = mapZoomAction.dataset.mapZoom;
      mapZoom = action === 'fit' ? 1 : Math.max(1, Math.min(3, mapZoom + (action === 'in' ? 1 : -1)));
      updateMapViewport(mapZoom > 1);
      document.querySelector('#campus-map-stage').focus({ preventScroll: true });
      return;
    }
    const area = event.target.closest('[data-area]');
    if (area) {
      if (currentMerchant) filters = readFilters(lastListHash);
      filters.area = area.dataset.area;
      filters.floor = 'all';
      setListHash();
      return;
    }
    const cardLink = event.target.closest('[data-card]');
    if (cardLink) {
      clearTimeout(searchTimer);
      lastListHash = getHash();
      history.replaceState(null, '', lastListHash);
      listScroll = window.scrollY;
    }
    const photo = event.target.closest('[data-photo]');
    if (photo) showPhoto(Number(photo.dataset.photo));
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'map') {
      if (!location.hash.startsWith('#/map')) { lastMapReturnHash = location.hash || '#/'; mapFromPage = true; mapDetailFromList = detailFromList; }
      const selected = event.target.closest('[data-map-area]')?.dataset.mapArea || (previousView === 'map' ? mapArea : filters.area !== 'all' ? filters.area : 'hongqiao');
      location.hash = `#/map?area=${selected}`;
    }
    if (action === 'map-back') {
      if (mapFromPage) history.back();
      else location.hash = lastMapReturnHash;
    }
    if (action === 'reset') { filters = defaultFilters(); setListHash(); }
    if (action === 'back') {
      if (detailFromList) history.back();
      else location.hash = lastListHash;
    }
    if (action === 'about') document.querySelector('#about-dialog').showModal();
    if (action === 'close-about') document.querySelector('#about-dialog').close();
    if (action === 'close-photo') document.querySelector('#photo-dialog').close();
    if (action === 'share') {
      try {
        if (navigator.share) await navigator.share({ title: document.title, url: location.href });
        else {
          await navigator.clipboard.writeText(location.href);
          showToast('商家链接已复制');
        }
      } catch (error) {
        if (error.name !== 'AbortError') showToast('请复制浏览器地址栏中的商家链接');
      }
    }
  });
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-merchant-image')) {
      event.target.outerHTML = placeholder(event.target.className);
    }
  }, true);
  document.querySelector('#prev-photo').addEventListener('click', () => showPhoto(photoIndex - 1));
  document.querySelector('#next-photo').addEventListener('click', () => showPhoto(photoIndex + 1));
  document.querySelector('#zoom-photo').addEventListener('click', () => {
    const stage = document.querySelector('#large-photo-frame');
    if (photoZoom === 3) { resetPhotoZoom(); return; }
    if (photoZoom === 1) photoBaseWidth = stage.querySelector('.menu-crop')?.getBoundingClientRect().width || photoBaseWidth;
    photoZoom += 1;
    stage.style.setProperty('--zoom-width', `${photoBaseWidth * photoZoom}px`);
    stage.classList.add('is-zoomed');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', '放大菜单，可横向滚动查看');
    stage.focus({ preventScroll: true });
    document.querySelector('#zoom-photo').textContent = photoZoom === 2 ? '放大 3×' : '适应屏幕';
    document.querySelector('#zoom-photo').setAttribute('aria-label', photoZoom === 2 ? '放大菜单至3倍' : '菜单适应屏幕');
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
      const search = document.querySelector('#search');
      if (search) { event.preventDefault(); search.focus(); }
    }
    if (document.querySelector('#photo-dialog').open && photoZoom === 1) {
      if (event.key === 'ArrowLeft' && photoIndex > 0) { event.preventDefault(); showPhoto(photoIndex - 1); }
      if (event.key === 'ArrowRight' && photoIndex < currentMerchant.menuImages.length - 1) { event.preventDefault(); showPhoto(photoIndex + 1); }
    }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (previousView === 'map') updateMapViewport(mapZoom > 1); });
  route();
})();

'use strict';

/* ============================================================
   State & API helpers
   ============================================================ */

const state = {
	family: [],
	items: [],
	cashflow: { startYear: 2026, years: 30, startingBalance: 0, values: {} },
	events: [],
	eventView: 'year', // 'year' | 'month'
	cashflowView: 'year', // 'year' | 'month'
	eventRange: null, // { start, end } - タイムラインの表示期間（西暦年）
	eventFamilyFilter: null, // Set<string> - タイムラインに表示する家族ID（'__common__' は共通イベント）
};

const COMMON_LANE_ID = '__common__';

const EVENT_CATEGORIES = {
	education: { label: '教育', icon: '🎓', color: '#3b6fa0' },
	housing: { label: '住まい', icon: '🏠', color: '#7a6b4f' },
	car: { label: '車', icon: '🚗', color: '#4f7a6b' },
	travel: { label: '旅行', icon: '✈️', color: '#a0703b' },
	medical: { label: '医療・介護', icon: '🏥', color: '#a03b5c' },
	work: { label: '仕事', icon: '💼', color: '#5c6b3b' },
	ceremony: { label: '冠婚葬祭', icon: '💍', color: '#7a3b6b' },
	other: { label: 'その他', icon: '📌', color: '#6b6f69' },
};
function categoryOf(key) {
	return EVENT_CATEGORIES[key] || EVENT_CATEGORIES.other;
}

const api = {
	async get(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`GET ${url} failed`);
		return res.json();
	},
	async post(url, body) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`POST ${url} failed`);
		return res.json();
	},
	async put(url, body) {
		const res = await fetch(url, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`PUT ${url} failed`);
		return res.json();
	},
	async patch(url, body) {
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`PATCH ${url} failed`);
		return res.json();
	},
	async del(url) {
		const res = await fetch(url, { method: 'DELETE' });
		if (!res.ok && res.status !== 204) throw new Error(`DELETE ${url} failed`);
	},
};

/* ============================================================
   Utilities
   ============================================================ */

function yen(n) {
	const v = Number(n) || 0;
	return v.toLocaleString('ja-JP');
}

function ageInYear(birthYear, year) {
	return year - birthYear;
}

function debounce(fn, ms) {
	let t;
	return (...args) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
}

let toastTimer;
function showToast(msg) {
	const el = document.getElementById('toast');
	el.textContent = msg;
	el.classList.add('is-visible');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
}

function yearsRange() {
	const { startYear, years } = state.cashflow;
	return Array.from({ length: years }, (_, i) => startYear + i);
}

function familyById(id) {
	return state.family.find((f) => f.id === id);
}

function topLevelItems(type) {
	return state.items
		.filter((i) => i.type === type && !i.parentId)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function childrenOfItem(parentId) {
	return state.items
		.filter((i) => i.parentId === parentId)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function itemTotalValue(item, year) {
	const children = childrenOfItem(item.id);
	if (children.length === 0) return itemValue(item.id, year);
	return children.reduce((sum, c) => sum + itemValue(c.id, year), 0);
}

function laneIdOf(ev) {
	return ev.familyId || COMMON_LANE_ID;
}

function clampEventRange(range) {
	const { startYear, years } = state.cashflow;
	const minY = startYear;
	const maxY = startYear + years - 1;
	let start = Math.min(Math.max(range.start, minY), maxY);
	let end = Math.min(Math.max(range.end, minY), maxY);
	if (start > end) {
		const t = start;
		start = end;
		end = t;
	}
	return { start, end };
}

/* ============================================================
   Tabs
   ============================================================ */

function initTabs() {
	document.querySelectorAll('.tab-btn').forEach((btn) => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach((b) => {
				b.classList.remove('is-active');
				b.setAttribute('aria-selected', 'false');
			});
			document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('is-active'));
			btn.classList.add('is-active');
			btn.setAttribute('aria-selected', 'true');
			document.getElementById(`tab-${btn.dataset.tab}`).classList.add('is-active');
		});
	});
}

/* ============================================================
   Generic modal
   ============================================================ */

const modalBackdrop = () => document.getElementById('modal-backdrop');

function openModal({ title, fieldsHtml, onConfirm }) {
	document.getElementById('modal-title').textContent = title;
	document.getElementById('modal-body').innerHTML = fieldsHtml;
	modalBackdrop().classList.add('is-active');

	const confirmBtn = document.getElementById('modal-confirm');
	const cancelBtn = document.getElementById('modal-cancel');

	const close = () => modalBackdrop().classList.remove('is-active');

	const confirmHandler = async () => {
		try {
			await onConfirm();
			close();
		} catch (e) {
			showToast('保存に失敗しました');
			console.error(e);
		}
	};

	// replace nodes to clear old listeners
	const newConfirm = confirmBtn.cloneNode(true);
	confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
	newConfirm.addEventListener('click', confirmHandler);

	const newCancel = cancelBtn.cloneNode(true);
	cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
	newCancel.addEventListener('click', close);
}

modalBackdrop().addEventListener('click', (e) => {
	if (e.target === modalBackdrop()) modalBackdrop().classList.remove('is-active');
});

/* ============================================================
   家族設定
   ============================================================ */

function renderFamily() {
	const tbody = document.getElementById('family-tbody');
	tbody.innerHTML = '';

	if (state.family.length === 0) {
		tbody.innerHTML =
			'<tr class="empty-row"><td colspan="5">家族が登録されていません。「+ 家族を追加」から追加してください。</td></tr>';
		return;
	}

	for (const member of state.family) {
		const tr = document.createElement('tr');
		tr.innerHTML = `
      <td><input type="text" value="${escapeAttr(member.name)}" data-field="name" /></td>
      <td><input type="text" value="${escapeAttr(member.role)}" data-field="role" /></td>
      <td class="num"><input type="number" value="${
				member.birthYear
			}" data-field="birthYear" style="text-align:right" /></td>
      <td><input type="color" class="color-swatch" value="${
				member.color || '#2f6f6a'
			}" data-field="color" /></td>
      <td class="col-actions"><button class="btn-icon" title="削除">✕</button></td>
    `;

		tr.querySelectorAll('input').forEach((input) => {
			input.addEventListener(
				'change',
				debounce(async () => {
					const field = input.dataset.field;
					const value = field === 'birthYear' ? Number(input.value) : input.value;
					const updated = await api.put(`/api/family/${member.id}`, { [field]: value });
					Object.assign(member, updated);
					renderCashflow();
					renderEvents();
				}, 300),
			);
		});

		tr.querySelector('.btn-icon').addEventListener('click', async () => {
			if (!confirm(`「${member.name}」を削除しますか？`)) return;
			await api.del(`/api/family/${member.id}`);
			state.family = state.family.filter((f) => f.id !== member.id);
			if (state.eventFamilyFilter) state.eventFamilyFilter.delete(member.id);
			renderFamily();
			renderCashflow();
			renderEvents();
		});

		tbody.appendChild(tr);
	}
}

document.getElementById('family-add-btn').addEventListener('click', () => {
	openModal({
		title: '家族を追加',
		fieldsHtml: `
      <div class="field"><label>氏名</label><input type="text" id="f-name" placeholder="例：次郎" /></div>
      <div class="field"><label>続柄</label><input type="text" id="f-role" placeholder="例：子" /></div>
      <div class="field"><label>生年（西暦）</label><input type="number" id="f-birthYear" placeholder="例：2022" /></div>
      <div class="field"><label>ラベルカラー</label><input type="color" id="f-color" value="#2f6f6a" /></div>
    `,
		onConfirm: async () => {
			const name = document.getElementById('f-name').value.trim();
			const role = document.getElementById('f-role').value.trim();
			const birthYear = Number(document.getElementById('f-birthYear').value);
			const color = document.getElementById('f-color').value;
			if (!name || !birthYear) {
				showToast('氏名と生年を入力してください');
				throw new Error('validation');
			}
			const created = await api.post('/api/family', { name, role, birthYear, color });
			state.family.push(created);
			if (state.eventFamilyFilter) state.eventFamilyFilter.add(created.id);
			renderFamily();
			renderCashflow();
			renderEvents();
			showToast('家族を追加しました');
		},
	});
});

/* ============================================================
   項目設定
   ============================================================ */

function renderItems() {
	renderItemGroup('income', 'income-items-tbody');
	renderItemGroup('expense', 'expense-items-tbody');
}

function renderItemGroup(type, tbodyId) {
	const tbody = document.getElementById(tbodyId);
	tbody.innerHTML = '';
	const topItems = topLevelItems(type);

	if (topItems.length === 0) {
		tbody.innerHTML = '<tr class="empty-row"><td colspan="2">項目がありません</td></tr>';
		return;
	}

	for (const item of topItems) {
		const tr = document.createElement('tr');
		tr.className = 'item-row-parent';
		tr.innerHTML = `
      <td><input type="text" value="${escapeAttr(item.name)}" data-field="name" /></td>
      <td class="col-actions">
        <button class="btn-icon" data-act="add-child" title="小項目を追加">＋</button>
        <button class="btn-icon" data-act="delete" title="削除">✕</button>
      </td>
    `;
		tr.querySelector('input').addEventListener(
			'change',
			debounce(async () => {
				const value = tr.querySelector('input').value.trim();
				const updated = await api.put(`/api/items/${item.id}`, { name: value });
				Object.assign(item, updated);
				renderCashflow();
			}, 300),
		);

		tr.querySelector('[data-act="add-child"]').addEventListener('click', () =>
			openAddSubItemModal(item),
		);

		tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
			const children = childrenOfItem(item.id);
			const confirmMsg = children.length
				? `「${item.name}」と、その小項目（${children
						.map((c) => c.name)
						.join('、')}）をすべて削除しますか？（過去の入力値も削除されます）`
				: `「${item.name}」を削除しますか？（過去の入力値も削除されます）`;
			if (!confirm(confirmMsg)) return;
			await api.del(`/api/items/${item.id}`);
			const removedIds = [item.id, ...children.map((c) => c.id)];
			state.items = state.items.filter((i) => !removedIds.includes(i.id));
			removedIds.forEach((id) => delete state.cashflow.values[id]);
			renderItems();
			renderCashflow();
		});

		tbody.appendChild(tr);

		for (const child of childrenOfItem(item.id)) {
			const ctr = document.createElement('tr');
			ctr.className = 'item-row-child';
			ctr.innerHTML = `
        <td><input type="text" value="${escapeAttr(child.name)}" data-field="name" /></td>
        <td class="col-actions"><button class="btn-icon" data-act="delete" title="削除">✕</button></td>
      `;
			ctr.querySelector('input').addEventListener(
				'change',
				debounce(async () => {
					const value = ctr.querySelector('input').value.trim();
					const updated = await api.put(`/api/items/${child.id}`, { name: value });
					Object.assign(child, updated);
					renderCashflow();
				}, 300),
			);
			ctr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
				if (!confirm(`「${child.name}」を削除しますか？（過去の入力値も削除されます）`)) return;
				await api.del(`/api/items/${child.id}`);
				state.items = state.items.filter((i) => i.id !== child.id);
				delete state.cashflow.values[child.id];
				renderItems();
				renderCashflow();
			});
			tbody.appendChild(ctr);
		}
	}
}

function openAddSubItemModal(parent) {
	openModal({
		title: `「${parent.name}」に小項目を追加`,
		fieldsHtml: `
      <div class="field"><label>小項目名</label><input type="text" id="subit-name" placeholder="例：電気代" /></div>
    `,
		onConfirm: async () => {
			const name = document.getElementById('subit-name').value.trim();
			if (!name) {
				showToast('項目名を入力してください');
				throw new Error('validation');
			}
			const order = childrenOfItem(parent.id).length + 1;
			const created = await api.post('/api/items', {
				type: parent.type,
				name,
				order,
				parentId: parent.id,
			});
			state.items.push(created);
			// 大項目に直接入力されていた金額が最初の小項目へ引き継がれている場合があるため再取得
			state.cashflow = await api.get('/api/cashflow');
			renderItems();
			renderCashflow();
			showToast('小項目を追加しました');
		},
	});
}

document.getElementById('item-add-btn').addEventListener('click', () => {
	openModal({
		title: '収支項目を追加',
		fieldsHtml: `
      <div class="field"><label>種別</label>
        <select id="it-type">
          <option value="income">収入</option>
          <option value="expense">支出</option>
        </select>
      </div>
      <div class="field"><label>項目名</label><input type="text" id="it-name" placeholder="例：ボーナス" /></div>
    `,
		onConfirm: async () => {
			const type = document.getElementById('it-type').value;
			const name = document.getElementById('it-name').value.trim();
			if (!name) {
				showToast('項目名を入力してください');
				throw new Error('validation');
			}
			const order = state.items.filter((i) => i.type === type).length + 1;
			const created = await api.post('/api/items', { type, name, order });
			state.items.push(created);
			renderItems();
			renderCashflow();
			showToast('項目を追加しました');
		},
	});
});

/* ============================================================
   ライフイベント表
   ============================================================ */

function eventFieldsHtml(ev) {
	const opts = Object.entries(EVENT_CATEGORIES)
		.map(
			([key, c]) =>
				`<option value="${key}" ${ev?.category === key ? 'selected' : ''}>${c.icon} ${
					c.label
				}</option>`,
		)
		.join('');
	return `
    <div class="field"><label>年（西暦）</label><input type="number" id="ev-year" value="${
			ev?.year ?? state.cashflow.startYear
		}" /></div>
    <div class="field"><label>月（任意・空欄可）</label><input type="number" id="ev-month" min="1" max="12" placeholder="例：4（未入力可）" value="${
			ev?.month ?? ''
		}" /></div>
    <div class="field"><label>対象</label>
      <select id="ev-family">
        <option value="">共通</option>
        ${state.family
					.map(
						(f) =>
							`<option value="${f.id}" ${ev?.familyId === f.id ? 'selected' : ''}>${escapeHtml(
								f.name,
							)}</option>`,
					)
					.join('')}
      </select>
    </div>
    <div class="field"><label>カテゴリ</label><select id="ev-category">${opts}</select></div>
    <div class="field"><label>イベント内容</label><input type="text" id="ev-title" placeholder="例：入学、車購入 など" value="${escapeAttr(
			ev?.title ?? '',
		)}" /></div>
    <div class="field"><label>費用（円）</label><input type="number" id="ev-cost" placeholder="0" value="${
			ev?.cost ?? ''
		}" /></div>
    <div class="field"><label>メモ</label><input type="text" id="ev-memo" placeholder="任意" value="${escapeAttr(
			ev?.memo ?? '',
		)}" /></div>
  `;
}

function readEventForm() {
	const year = Number(document.getElementById('ev-year').value);
	const monthRaw = document.getElementById('ev-month').value;
	const month = monthRaw === '' ? null : Math.min(12, Math.max(1, Number(monthRaw)));
	const familyId = document.getElementById('ev-family').value;
	const category = document.getElementById('ev-category').value;
	const title = document.getElementById('ev-title').value.trim();
	const cost = Number(document.getElementById('ev-cost').value) || 0;
	const memo = document.getElementById('ev-memo').value.trim();
	return { year, month, familyId, category, title, cost, memo };
}

function openAddEventModal(prefill) {
	openModal({
		title: 'ライフイベントを追加',
		fieldsHtml: eventFieldsHtml(prefill),
		onConfirm: async () => {
			const data = readEventForm();
			if (!data.title || !data.year) {
				showToast('年とイベント内容を入力してください');
				throw new Error('validation');
			}
			const created = await api.post('/api/events', data);
			state.events.push(created);
			renderEvents();
			renderCashflow();
			showToast('ライフイベントを追加しました');
		},
	});
}

function openEditEventModal(ev) {
	openModal({
		title: 'ライフイベントを編集',
		fieldsHtml: eventFieldsHtml(ev),
		onConfirm: async () => {
			const data = readEventForm();
			if (!data.title || !data.year) {
				showToast('年とイベント内容を入力してください');
				throw new Error('validation');
			}
			const updated = await api.put(`/api/events/${ev.id}`, data);
			Object.assign(ev, updated);
			renderEvents();
			renderCashflow();
			showToast('ライフイベントを更新しました');
		},
	});
}

async function deleteEvent(ev) {
	if (!confirm(`「${ev.title}」を削除しますか？`)) return;
	await api.del(`/api/events/${ev.id}`);
	state.events = state.events.filter((e) => e.id !== ev.id);
	renderEvents();
	renderCashflow();
}

document.getElementById('event-add-btn').addEventListener('click', () => openAddEventModal());

document.getElementById('event-view-toggle').addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-view]');
	if (!btn) return;
	state.eventView = btn.dataset.view;
	document
		.querySelectorAll('#event-view-toggle button')
		.forEach((b) => b.classList.toggle('is-active', b === btn));
	renderEvents();
});

/* ---- events: timeline display-period filter ---- */

const tlRangeStartInput = document.getElementById('tl-range-start');
const tlRangeEndInput = document.getElementById('tl-range-end');

function applyTimelineRangeInputs() {
	if (!state.eventRange) return;
	state.eventRange = clampEventRange({
		start: Number(tlRangeStartInput.value) || state.eventRange.start,
		end: Number(tlRangeEndInput.value) || state.eventRange.end,
	});
	renderTimelineFilters();
	renderEventsTimeline();
}

tlRangeStartInput.addEventListener('change', debounce(applyTimelineRangeInputs, 250));
tlRangeEndInput.addEventListener('change', debounce(applyTimelineRangeInputs, 250));

/* ---- events: timeline family filter + period inputs (render) ---- */

function timelineLanes() {
	return [
		...state.family.map((f) => ({
			id: f.id,
			name: f.name,
			role: f.role,
			color: f.color || '#667069',
		})),
		{ id: COMMON_LANE_ID, name: '共通', role: '', color: '#8a8f86' },
	];
}

function renderTimelineFilters() {
	if (!state.eventRange || !state.eventFamilyFilter) return;

	tlRangeStartInput.value = state.eventRange.start;
	tlRangeEndInput.value = state.eventRange.end;

	const list = document.getElementById('family-chip-list');
	list.innerHTML = timelineLanes()
		.map((lane) => {
			const checked = state.eventFamilyFilter.has(lane.id);
			return `<label class="family-chip ${checked ? 'is-checked' : ''}">
      <input type="checkbox" value="${lane.id}" ${checked ? 'checked' : ''} />
      <span class="fam-dot" style="background:${lane.color}"></span>${escapeHtml(lane.name)}
    </label>`;
		})
		.join('');

	list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
		cb.addEventListener('change', () => {
			if (cb.checked) state.eventFamilyFilter.add(cb.value);
			else state.eventFamilyFilter.delete(cb.value);
			cb.closest('.family-chip').classList.toggle('is-checked', cb.checked);
			renderEventsTimeline();
		});
	});
}

/* ---- events: list (read-only rows + edit/delete) ---- */

function renderEventsList() {
	const tbody = document.getElementById('events-tbody');
	tbody.innerHTML = '';

	if (state.events.length === 0) {
		tbody.innerHTML =
			'<tr class="empty-row"><td colspan="6">イベントが登録されていません。「+ イベントを追加」から追加してください。</td></tr>';
		return;
	}

	const sorted = [...state.events].sort(
		(a, b) => a.year - b.year || (a.month || 0) - (b.month || 0),
	);

	for (const ev of sorted) {
		const member = familyById(ev.familyId);
		const cat = categoryOf(ev.category);
		const tr = document.createElement('tr');
		tr.innerHTML = `
      <td>${ev.year}年${ev.month ? `${ev.month}月` : ''}</td>
      <td>${member ? escapeHtml(member.name) : '共通'}</td>
      <td>${cat.icon} ${cat.label}</td>
      <td>${escapeHtml(ev.title)}</td>
      <td class="num">${yen(ev.cost)}</td>
      <td class="col-actions">
        <button class="btn-icon" data-act="edit" title="編集">✎</button>
        <button class="btn-icon" data-act="delete" title="削除">✕</button>
      </td>
    `;
		tr.querySelector('[data-act="edit"]').addEventListener('click', () => openEditEventModal(ev));
		tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteEvent(ev));
		tbody.appendChild(tr);
	}
}

/* ---- events: horizontal timeline ---- */

function eventChipHtml(ev, isMonth) {
	const cat = categoryOf(ev.category);
	if (isMonth) {
		const title = `${ev.year}年${ev.month ? ev.month + '月' : ''} ${cat.label}：${ev.title}${
			ev.cost ? `（${yen(ev.cost)}円）` : ''
		}`;
		return `<div class="tl-chip" data-id="${ev.id}" style="border-top-color:${
			cat.color
		};background:${cat.color}22" title="${escapeAttr(title)}">${cat.icon}</div>`;
	}
	return `<div class="tl-chip" data-id="${ev.id}" style="border-left-color:${
		cat.color
	};background:${cat.color}1a">
    <div class="tl-chip-title">${cat.icon} ${escapeHtml(ev.title)}</div>
    ${ev.cost ? `<div class="tl-chip-sub">${yen(ev.cost)}円</div>` : ''}
  </div>`;
}

function renderEventsTimeline() {
	const wrap = document.getElementById('events-timeline-scroll');
	const legend = document.getElementById('events-legend');
	const isMonth = state.eventView === 'month';

	// FPインサイトはキャッシュフロー全期間で判定（表示期間の絞り込みとは独立）
	const { years: fullYears, perYear } = computeYearlyTotals();
	renderFpInsight('events-insight', perYear, fullYears);

	// タイムラインに実際に表示する期間（フィルターで絞り込み可能）
	const range = clampEventRange(
		state.eventRange || { start: fullYears[0], end: fullYears[fullYears.length - 1] },
	);
	state.eventRange = range;
	const years = [];
	for (let y = range.start; y <= range.end; y++) years.push(y);

	const maxAbsBalance = Math.max(
		1,
		...years.map((y) => Math.abs((perYear[y] && perYear[y].balance) || 0)),
	);

	// 縦軸＝家族ごとの行（フィルターで選択された家族＋共通）
	const filter = state.eventFamilyFilter || new Set(timelineLanes().map((l) => l.id));
	const lanes = timelineLanes().filter((l) => filter.has(l.id));

	// イベントを「家族×年（または年月）」でグルーピング
	const byLaneKey = {};
	for (const ev of state.events) {
		if (ev.year < years[0] || ev.year > years[years.length - 1]) continue;
		const laneId = laneIdOf(ev);
		const key = isMonth ? `${ev.year}-${ev.month || 4}` : `${ev.year}`;
		byLaneKey[laneId] = byLaneKey[laneId] || {};
		byLaneKey[laneId][key] = byLaneKey[laneId][key] || [];
		byLaneKey[laneId][key].push(ev);
	}

	let html = `<table class="tl-table${isMonth ? ' is-month' : ''}">`;

	// ---- 見出し行 ----
	html += '<thead>';
	if (!isMonth) {
		html += `<tr><th class="row-label">年 ／ 家族</th>${years
			.map((y) => `<th>${y}</th>`)
			.join('')}</tr>`;
	} else {
		html += `<tr><th class="row-label" rowspan="2">年 ／ 家族</th>${years
			.map((y) => `<th class="tl-year-head" colspan="12">${y}年</th>`)
			.join('')}</tr>`;
		html += `<tr>${years
			.map(() =>
				Array.from({ length: 12 }, (_, i) => {
					const m = i + 1;
					return `<th class="tl-month${m === 4 ? ' is-april' : ''}">${m}</th>`;
				}).join(''),
			)
			.join('')}</tr>`;
	}
	html += '</thead>';

	// ---- 本体 ----
	html += '<tbody>';

	// 貯蓄残高の行（背景色でプラス／マイナスの目安を表示）
	html += '<tr class="tl-balance-row"><td class="row-label">貯蓄残高</td>';
	years.forEach((y) => {
		const b = (perYear[y] && perYear[y].balance) || 0;
		const ratio = Math.abs(b) / maxAbsBalance;
		const bg =
			b < 0 ? `rgba(178,58,46,${0.12 + ratio * 0.35})` : `rgba(47,111,106,${0.08 + ratio * 0.28})`;
		if (!isMonth) {
			html += `<td style="background:${bg}" class="${b < 0 ? 'negative' : ''}">${yen(b)}</td>`;
		} else {
			html += `<td colspan="12" style="background:${bg}" class="${b < 0 ? 'negative' : ''}">${yen(
				b,
			)}円</td>`;
		}
	});
	html += '</tr>';

	// 家族ごとの行（＋共通）
	if (lanes.length === 0) {
		const colCount = isMonth ? years.length * 12 : years.length;
		html += `<tr class="empty-row"><td colspan="${
			colCount + 1
		}">表示する家族が選択されていません。上のフィルターから選んでください。</td></tr>`;
	} else {
		for (const lane of lanes) {
			const laneEvents = byLaneKey[lane.id] || {};
			html += `<tr class="tl-family-row"><td class="row-label"><span class="fam-dot" style="background:${
				lane.color
			}"></span>${escapeHtml(lane.name)}${lane.role ? `（${escapeHtml(lane.role)}）` : ''}</td>`;
			if (!isMonth) {
				years.forEach((y) => {
					const evs = laneEvents[String(y)] || [];
					html += `<td><div class="tl-cell">${evs
						.map((e) => eventChipHtml(e, false))
						.join('')}</div></td>`;
				});
			} else {
				years.forEach((y) => {
					for (let m = 1; m <= 12; m++) {
						const evs = laneEvents[`${y}-${m}`] || [];
						html += `<td><div class="tl-cell">${evs
							.map((e) => eventChipHtml(e, true))
							.join('')}</div></td>`;
					}
				});
			}
			html += '</tr>';
		}
	}

	html += '</tbody></table>';
	wrap.innerHTML = html;

	// 凡例
	legend.innerHTML =
		Object.values(EVENT_CATEGORIES)
			.map(
				(c) =>
					`<span class="legend-item"><span class="legend-swatch" style="background:${c.color}"></span>${c.icon} ${c.label}</span>`,
			)
			.join('') +
		`<span class="legend-item">背景色：貯蓄残高がプラス（緑）／マイナス（赤）の目安</span>`;

	// クリックで編集
	wrap.querySelectorAll('.tl-chip').forEach((chip) => {
		chip.addEventListener('click', () => {
			const ev = state.events.find((e) => e.id === chip.dataset.id);
			if (ev) openEditEventModal(ev);
		});
	});

	wrap.scrollLeft = 0;
}

function renderEvents() {
	renderEventsList();
	renderTimelineFilters();
	renderEventsTimeline();
}

/* ============================================================
   キャッシュフロー表
   ============================================================ */

function itemValue(itemId, year) {
	const row = state.cashflow.values[itemId];
	if (!row) return 0;
	const v = row[String(year)];
	return v === undefined ? 0 : Number(v);
}

function eventsCostInYear(year) {
	return state.events
		.filter((e) => e.year === year)
		.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
}

function eventsTitlesInYear(year) {
	return state.events
		.filter((e) => e.year === year)
		.map((e) => {
			const m = familyById(e.familyId);
			return m ? `${e.title}（${m.name}）` : e.title;
		})
		.join('、');
}

function computeYearlyTotals() {
	const years = yearsRange();
	const incomeItems = topLevelItems('income');
	const expenseItems = topLevelItems('expense');

	const perYear = {};
	let cumulative = state.cashflow.startingBalance;

	for (const year of years) {
		const incomeTotal = incomeItems.reduce((s, it) => s + itemTotalValue(it, year), 0);
		const expenseItemsTotal = expenseItems.reduce((s, it) => s + itemTotalValue(it, year), 0);
		const eventCost = eventsCostInYear(year);
		const expenseTotal = expenseItemsTotal + eventCost;
		const net = incomeTotal - expenseTotal;
		cumulative += net;
		perYear[year] = {
			incomeTotal,
			expenseItemsTotal,
			eventCost,
			expenseTotal,
			net,
			balance: cumulative,
		};
	}
	return { years, incomeItems, expenseItems, perYear };
}

/* ---- FP insight: first year the balance goes negative, etc. ---- */

function renderFpInsight(targetId, perYear, years) {
	const el = document.getElementById(targetId);
	if (!el) return;
	const firstNegative = years.find((y) => perYear[y].balance < 0);

	if (firstNegative) {
		el.className = 'fp-insight is-warning';
		el.innerHTML = `<span class="fp-icon">⚠️</span>
      <span><strong>${firstNegative}年</strong>に貯蓄残高がマイナスに転じる見込みです。支出の見直しや収入項目の追加を検討しましょう。</span>`;
	} else {
		const last = years[years.length - 1];
		el.className = 'fp-insight is-safe';
		el.innerHTML = `<span class="fp-icon">✅</span>
      <span>${
				years[0]
			}年〜${last}年の間、貯蓄残高はプラスを維持できる見込みです（${last}年末時点：${yen(
				perYear[last].balance,
			)}円）。</span>`;
	}
}

/* ---- monthly breakdown (for 月表示) ---- */
/* 年間の収入・支出項目は12等分した金額を毎月表示し、ライフイベント費用だけは
   実際に発生する月に計上することで、月ごとの貯蓄残高の増減が分かるようにする。 */

function computeMonthlyTotals() {
	const { years, incomeItems, expenseItems, perYear } = computeYearlyTotals();
	const monthly = [];
	let cumulative = state.cashflow.startingBalance;

	years.forEach((year) => {
		const annual = perYear[year];
		const monthlyIncome = annual.incomeTotal / 12;
		const monthlyExpenseItems = annual.expenseItemsTotal / 12;
		for (let m = 1; m <= 12; m++) {
			const eventCost = state.events
				.filter((e) => e.year === year && (e.month || 4) === m)
				.reduce((s, e) => s + (Number(e.cost) || 0), 0);
			const expenseTotal = monthlyExpenseItems + eventCost;
			const net = monthlyIncome - expenseTotal;
			cumulative += net;
			monthly.push({
				year,
				month: m,
				incomeTotal: monthlyIncome,
				expenseItemsTotal: monthlyExpenseItems,
				eventCost,
				expenseTotal,
				net,
				balance: cumulative,
			});
		}
	});

	return { years, incomeItems, expenseItems, monthly };
}

function eventsTitlesInMonth(year, month) {
	return state.events
		.filter((e) => e.year === year && (e.month || 4) === month)
		.map((e) => {
			const m = familyById(e.familyId);
			return m ? `${e.title}（${m.name}）` : e.title;
		})
		.join('、');
}

function renderCashflowYearTable(table, years, incomeItems, expenseItems, perYear) {
	const rows = [];

	rows.push(`<thead><tr>
    <th class="row-label">年</th>
    ${years.map((y) => `<th>${y}</th>`).join('')}
  </tr></thead>`);

	const bodyRows = [];

	for (const member of state.family) {
		bodyRows.push(`<tr class="row-age">
      <td class="row-label" style="color:${member.color || '#667069'}">${escapeHtml(
				member.name,
			)}（${escapeHtml(member.role)}）</td>
      ${years.map((y) => `<td>${ageInYear(member.birthYear, y)}歳</td>`).join('')}
    </tr>`);
	}

	bodyRows.push(`<tr class="row-life-event">
    <td class="row-label">ライフイベント</td>
    ${years.map((y) => `<td>${escapeHtml(eventsTitlesInYear(y)) || '－'}</td>`).join('')}
  </tr>`);

	bodyRows.push(
		`<tr class="section-head"><td class="row-label">収入</td>${years
			.map(() => '<td></td>')
			.join('')}</tr>`,
	);
	for (const item of incomeItems) {
		const children = childrenOfItem(item.id);
		if (children.length === 0) {
			bodyRows.push(`<tr class="row-income" data-item="${item.id}">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${years
					.map(
						(y) =>
							`<td><input class="cell-input" type="number" data-item="${
								item.id
							}" data-year="${y}" value="${itemValue(item.id, y) || ''}" placeholder="0" /></td>`,
					)
					.join('')}
      </tr>`);
		} else {
			bodyRows.push(`<tr class="row-income row-subtotal">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${years.map((y) => `<td>${yen(itemTotalValue(item, y))}</td>`).join('')}
      </tr>`);
			for (const child of children) {
				bodyRows.push(`<tr class="row-income row-subitem" data-item="${child.id}">
          <td class="row-label">${escapeHtml(child.name)}</td>
          ${years
						.map(
							(y) =>
								`<td><input class="cell-input" type="number" data-item="${
									child.id
								}" data-year="${y}" value="${
									itemValue(child.id, y) || ''
								}" placeholder="0" /></td>`,
						)
						.join('')}
        </tr>`);
			}
		}
	}
	bodyRows.push(`<tr class="row-total income">
    <td class="row-label">収入合計</td>
    ${years.map((y) => `<td>${yen(perYear[y].incomeTotal)}</td>`).join('')}
  </tr>`);

	bodyRows.push(
		`<tr class="section-head"><td class="row-label">支出</td>${years
			.map(() => '<td></td>')
			.join('')}</tr>`,
	);
	for (const item of expenseItems) {
		const children = childrenOfItem(item.id);
		if (children.length === 0) {
			bodyRows.push(`<tr class="row-expense" data-item="${item.id}">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${years
					.map(
						(y) =>
							`<td><input class="cell-input" type="number" data-item="${
								item.id
							}" data-year="${y}" value="${itemValue(item.id, y) || ''}" placeholder="0" /></td>`,
					)
					.join('')}
      </tr>`);
		} else {
			bodyRows.push(`<tr class="row-expense row-subtotal">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${years.map((y) => `<td>${yen(itemTotalValue(item, y))}</td>`).join('')}
      </tr>`);
			for (const child of children) {
				bodyRows.push(`<tr class="row-expense row-subitem" data-item="${child.id}">
          <td class="row-label">${escapeHtml(child.name)}</td>
          ${years
						.map(
							(y) =>
								`<td><input class="cell-input" type="number" data-item="${
									child.id
								}" data-year="${y}" value="${
									itemValue(child.id, y) || ''
								}" placeholder="0" /></td>`,
						)
						.join('')}
        </tr>`);
			}
		}
	}
	bodyRows.push(`<tr class="row-expense">
    <td class="row-label">ライフイベント費用</td>
    ${years
			.map((y) => `<td>${perYear[y].eventCost ? yen(perYear[y].eventCost) : '－'}</td>`)
			.join('')}
  </tr>`);
	bodyRows.push(`<tr class="row-total expense">
    <td class="row-label">支出合計</td>
    ${years.map((y) => `<td>${yen(perYear[y].expenseTotal)}</td>`).join('')}
  </tr>`);

	bodyRows.push(`<tr class="row-net">
    <td class="row-label">年間収支</td>
    ${years
			.map(
				(y) =>
					`<td class="${perYear[y].net < 0 ? 'negative' : 'positive'}">${yen(perYear[y].net)}</td>`,
			)
			.join('')}
  </tr>`);
	bodyRows.push(`<tr class="row-balance">
    <td class="row-label">貯蓄残高</td>
    ${years
			.map(
				(y) =>
					`<td class="${perYear[y].balance < 0 ? 'negative' : ''}">${yen(perYear[y].balance)}</td>`,
			)
			.join('')}
  </tr>`);

	rows.push(`<tbody>${bodyRows.join('')}</tbody>`);
	table.className = 'cf-table';
	table.innerHTML = rows.join('');

	table.querySelectorAll('.cell-input').forEach((input) => {
		input.addEventListener(
			'change',
			debounce(async () => {
				const itemId = input.dataset.item;
				const year = input.dataset.year;
				const value = input.value === '' ? null : Number(input.value);
				const updated = await api.patch('/api/cashflow/cell', { itemId, year, value });
				state.cashflow = updated;
				renderCashflow();
			}, 250),
		);
	});
}

function renderCashflowMonthTable(table, years, incomeItems, expenseItems) {
	const { monthly } = computeMonthlyTotals();
	const monthAt = (yIdx, m) => monthly[yIdx * 12 + (m - 1)];
	const eachMonth = (fn) =>
		years
			.map((y, yIdx) => Array.from({ length: 12 }, (_, i) => fn(y, i + 1, yIdx)).join(''))
			.join('');

	const rows = [];

	rows.push('<thead>');
	rows.push(
		`<tr><th class="row-label" rowspan="2">年 ／ 月</th>${years
			.map((y) => `<th class="tl-year-head" colspan="12">${y}年</th>`)
			.join('')}</tr>`,
	);
	rows.push(
		`<tr>${years
			.map(() =>
				Array.from({ length: 12 }, (_, i) => {
					const m = i + 1;
					return `<th class="tl-month${m === 4 ? ' is-april' : ''}">${m}</th>`;
				}).join(''),
			)
			.join('')}</tr>`,
	);
	rows.push('</thead>');

	const bodyRows = [];

	for (const member of state.family) {
		bodyRows.push(`<tr class="row-age">
      <td class="row-label" style="color:${member.color || '#667069'}">${escapeHtml(
				member.name,
			)}（${escapeHtml(member.role)}）</td>
      ${eachMonth((y) => `<td>${ageInYear(member.birthYear, y)}歳</td>`)}
    </tr>`);
	}

	bodyRows.push(`<tr class="row-life-event">
    <td class="row-label">ライフイベント</td>
    ${eachMonth((y, m) => `<td>${escapeHtml(eventsTitlesInMonth(y, m)) || ''}</td>`)}
  </tr>`);

	bodyRows.push(
		`<tr class="section-head"><td class="row-label">収入</td>${eachMonth(() => '<td></td>')}</tr>`,
	);
	for (const item of incomeItems) {
		const children = childrenOfItem(item.id);
		if (children.length === 0) {
			bodyRows.push(`<tr class="row-income">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${eachMonth((y) => `<td>${yen(Math.round(itemValue(item.id, y) / 12))}</td>`)}
      </tr>`);
		} else {
			bodyRows.push(`<tr class="row-income row-subtotal">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${eachMonth((y) => `<td>${yen(Math.round(itemTotalValue(item, y) / 12))}</td>`)}
      </tr>`);
			for (const child of children) {
				bodyRows.push(`<tr class="row-income row-subitem">
          <td class="row-label">${escapeHtml(child.name)}</td>
          ${eachMonth((y) => `<td>${yen(Math.round(itemValue(child.id, y) / 12))}</td>`)}
        </tr>`);
			}
		}
	}
	bodyRows.push(`<tr class="row-total income">
    <td class="row-label">収入合計</td>
    ${eachMonth((y, m, yIdx) => `<td>${yen(Math.round(monthAt(yIdx, m).incomeTotal))}</td>`)}
  </tr>`);

	bodyRows.push(
		`<tr class="section-head"><td class="row-label">支出</td>${eachMonth(() => '<td></td>')}</tr>`,
	);
	for (const item of expenseItems) {
		const children = childrenOfItem(item.id);
		if (children.length === 0) {
			bodyRows.push(`<tr class="row-expense">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${eachMonth((y) => `<td>${yen(Math.round(itemValue(item.id, y) / 12))}</td>`)}
      </tr>`);
		} else {
			bodyRows.push(`<tr class="row-expense row-subtotal">
        <td class="row-label">${escapeHtml(item.name)}</td>
        ${eachMonth((y) => `<td>${yen(Math.round(itemTotalValue(item, y) / 12))}</td>`)}
      </tr>`);
			for (const child of children) {
				bodyRows.push(`<tr class="row-expense row-subitem">
          <td class="row-label">${escapeHtml(child.name)}</td>
          ${eachMonth((y) => `<td>${yen(Math.round(itemValue(child.id, y) / 12))}</td>`)}
        </tr>`);
			}
		}
	}
	bodyRows.push(`<tr class="row-expense">
    <td class="row-label">ライフイベント費用</td>
    ${eachMonth((y, m, yIdx) => {
			const c = monthAt(yIdx, m);
			return `<td>${c.eventCost ? yen(c.eventCost) : '－'}</td>`;
		})}
  </tr>`);
	bodyRows.push(`<tr class="row-total expense">
    <td class="row-label">支出合計</td>
    ${eachMonth((y, m, yIdx) => `<td>${yen(Math.round(monthAt(yIdx, m).expenseTotal))}</td>`)}
  </tr>`);

	bodyRows.push(`<tr class="row-net">
    <td class="row-label">月間収支</td>
    ${eachMonth((y, m, yIdx) => {
			const c = monthAt(yIdx, m);
			return `<td class="${c.net < 0 ? 'negative' : 'positive'}">${yen(Math.round(c.net))}</td>`;
		})}
  </tr>`);
	bodyRows.push(`<tr class="row-balance">
    <td class="row-label">貯蓄残高</td>
    ${eachMonth((y, m, yIdx) => {
			const c = monthAt(yIdx, m);
			return `<td class="${c.balance < 0 ? 'negative' : ''}">${yen(Math.round(c.balance))}</td>`;
		})}
  </tr>`);

	rows.push(`<tbody>${bodyRows.join('')}</tbody>`);
	table.className = 'cf-table cf-table-month';
	table.innerHTML = rows.join('');
}

function renderCashflow() {
	const { startYear, years: yearCount, startingBalance } = state.cashflow;
	document.getElementById('cf-startYear').value = startYear;
	document.getElementById('cf-years').value = yearCount;
	document.getElementById('cf-startingBalance').value = startingBalance;

	const table = document.getElementById('cashflow-table');
	const { years, incomeItems, expenseItems, perYear } = computeYearlyTotals();

	renderFpInsight('cashflow-insight', perYear, years);

	if (state.cashflowView === 'month') {
		renderCashflowMonthTable(table, years, incomeItems, expenseItems);
	} else {
		renderCashflowYearTable(table, years, incomeItems, expenseItems, perYear);
	}
}

document.getElementById('cf-view-toggle').addEventListener('click', (e) => {
	const btn = e.target.closest('button[data-view]');
	if (!btn) return;
	state.cashflowView = btn.dataset.view;
	document
		.querySelectorAll('#cf-view-toggle button')
		.forEach((b) => b.classList.toggle('is-active', b === btn));
	renderCashflow();
});

document.getElementById('cf-save-settings').addEventListener('click', async () => {
	const startYear = Number(document.getElementById('cf-startYear').value);
	const years = Number(document.getElementById('cf-years').value);
	const startingBalance = Number(document.getElementById('cf-startingBalance').value);
	const updated = await api.put('/api/cashflow/settings', { startYear, years, startingBalance });
	state.cashflow = updated;
	renderCashflow();
	showToast('設定を保存しました');
});

/* ============================================================
   Escaping helpers
   ============================================================ */

function escapeHtml(str) {
	return String(str ?? '').replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[c],
	);
}
function escapeAttr(str) {
	return escapeHtml(str);
}

/* ============================================================
   Boot
   ============================================================ */

async function boot() {
	initTabs();
	try {
		const [family, items, cashflow, events] = await Promise.all([
			api.get('/api/family'),
			api.get('/api/items'),
			api.get('/api/cashflow'),
			api.get('/api/events'),
		]);
		state.family = family;
		state.items = items;
		state.cashflow = cashflow;
		state.events = events;

		// ライフイベントのタイムライン：初期表示は全期間・全家族（共通含む）
		state.eventRange = { start: cashflow.startYear, end: cashflow.startYear + cashflow.years - 1 };
		state.eventFamilyFilter = new Set([...family.map((f) => f.id), COMMON_LANE_ID]);

		renderFamily();
		renderItems();
		renderEvents();
		renderCashflow();
	} catch (e) {
		console.error(e);
		showToast('データの読み込みに失敗しました');
	}
}

boot();

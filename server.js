const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- small JSON-file "database" helpers ----------

function filePath(name) {
	return path.join(DATA_DIR, `${name}.json`);
}

async function readJson(name) {
	const raw = await fs.readFile(filePath(name), 'utf-8');
	return JSON.parse(raw);
}

async function writeJson(name, data) {
	await fs.writeFile(filePath(name), JSON.stringify(data, null, 2), 'utf-8');
}

function genId(prefix) {
	return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

// generic CRUD list factory for simple array-of-objects resources
function crudRouter(name, idPrefix, { onCreate, onUpdate } = {}) {
	const router = express.Router();

	router.get('/', async (req, res) => {
		try {
			res.json(await readJson(name));
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	});

	router.post('/', async (req, res) => {
		try {
			const list = await readJson(name);
			const item = { id: genId(idPrefix), ...req.body };
			if (onCreate) onCreate(item, list);
			list.push(item);
			await writeJson(name, list);
			res.status(201).json(item);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	});

	router.put('/:id', async (req, res) => {
		try {
			const list = await readJson(name);
			const idx = list.findIndex((x) => x.id === req.params.id);
			if (idx === -1) return res.status(404).json({ error: 'not found' });
			list[idx] = { ...list[idx], ...req.body, id: list[idx].id };
			if (onUpdate) onUpdate(list[idx], list);
			await writeJson(name, list);
			res.json(list[idx]);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	});

	router.delete('/:id', async (req, res) => {
		try {
			const list = await readJson(name);
			const next = list.filter((x) => x.id !== req.params.id);
			await writeJson(name, next);
			res.status(204).end();
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	});

	return router;
}

app.use('/api/family', crudRouter('family', 'f'));

// ---------- items: 支出/収入項目（「小項目」を持てる） ----------
// 大項目（parentId なし）はそのまま、その配下に小項目（parentId あり）を持てる。
// 小項目を持つ大項目は、キャッシュフロー表側で自動集計（小計）として扱われる。

app.post('/api/items', async (req, res) => {
	try {
		const items = await readJson('items');
		const { type, name, order, parentId } = req.body;
		const item = { id: genId('i'), type, name, order, ...(parentId ? { parentId } : {}) };

		items.push(item);
		await writeJson('items', items);

		// 大項目に初めて小項目を追加したときは、大項目に直接入力されていた金額を
		// そのまま最初の小項目へ引き継ぐ（データが消えないようにするため）
		if (parentId) {
			const siblingCount = items.filter((i) => i.parentId === parentId && i.id !== item.id).length;
			if (siblingCount === 0) {
				const cf = await readJson('cashflow');
				if (cf.values[parentId]) {
					cf.values[item.id] = cf.values[parentId];
					delete cf.values[parentId];
					await writeJson('cashflow', cf);
				}
			}
		}

		res.status(201).json(item);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

app.delete('/api/items/:id', async (req, res) => {
	try {
		const items = await readJson('items');
		const targetId = req.params.id;
		const childIds = items.filter((i) => i.parentId === targetId).map((i) => i.id);
		const removeIds = new Set([targetId, ...childIds]);
		const remaining = items.filter((i) => !removeIds.has(i.id));
		await writeJson('items', remaining);

		const cf = await readJson('cashflow');
		removeIds.forEach((id) => {
			delete cf.values[id];
		});
		await writeJson('cashflow', cf);

		res.status(204).end();
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

app.use('/api/items', crudRouter('items', 'i'));

app.use('/api/events', crudRouter('events', 'e'));

// ---------- cashflow: settings object + sparse value matrix ----------

app.get('/api/cashflow', async (req, res) => {
	try {
		res.json(await readJson('cashflow'));
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

app.put('/api/cashflow/settings', async (req, res) => {
	try {
		const cf = await readJson('cashflow');
		const { startYear, years, startingBalance } = req.body;
		if (startYear !== undefined) cf.startYear = Number(startYear);
		if (years !== undefined) cf.years = Number(years);
		if (startingBalance !== undefined) cf.startingBalance = Number(startingBalance);
		await writeJson('cashflow', cf);
		res.json(cf);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

app.patch('/api/cashflow/cell', async (req, res) => {
	try {
		const { itemId, year, value } = req.body;
		if (!itemId || year === undefined) {
			return res.status(400).json({ error: 'itemId and year are required' });
		}
		const cf = await readJson('cashflow');
		if (!cf.values[itemId]) cf.values[itemId] = {};
		if (value === null || value === '' || value === undefined) {
			delete cf.values[itemId][String(year)];
		} else {
			cf.values[itemId][String(year)] = Number(value);
		}
		await writeJson('cashflow', cf);
		res.json(cf);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

// remove an item's whole value row (used when deleting an item)
app.delete('/api/cashflow/item/:itemId', async (req, res) => {
	try {
		const cf = await readJson('cashflow');
		delete cf.values[req.params.itemId];
		await writeJson('cashflow', cf);
		res.json(cf);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

app.listen(PORT, () => {
	console.log(`家庭のキャッシュフロー表アプリ: http://localhost:${PORT}`);
});

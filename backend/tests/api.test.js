// Integration tests for the REST API, run against a throwaway in-memory MongoDB
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { app, User, seed } = require('../app.js');

let mongod;

beforeAll(async () => {
	mongod = await MongoMemoryServer.create();
	await mongoose.connect(mongod.getUri());
});

beforeEach(async () => {
	await seed();               // 23 sample posts, no users
	app.locals.sessData = {};   // clear in-memory sessions
});

afterAll(async () => {
	await mongoose.disconnect();
	await mongod.stop();
});

// --- helpers ---------------------------------------------------------------

const cookiePairs = res => (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);

async function signedInAgent(username = 'alice', password = 'secret123') {
	const agent = request.agent(app);
	const res = await agent.post('/signup').send({ username, password, realname: 'Alice' });
	expect(res.status).toBe(200);
	return { agent, cookies: cookiePairs(res) };
}

// --- GET /getposts ---------------------------------------------------------

describe('GET /getposts', () => {
	test('returns the 10 newest posts and the page count', async () => {
		const res = await request(app).get('/getposts');
		expect(res.status).toBe(200);
		expect(res.body.posts).toHaveLength(10);
		expect(res.body.numPages).toBe(3);
		expect(res.body.posts[0].id).toBe(23); // sorted newest first
	});

	test('paginates: page 3 holds the remaining 3 posts', async () => {
		const res = await request(app).get('/getposts?page=3');
		expect(res.body.posts.map(p => p.id)).toEqual([3, 2, 1]);
	});

	test('clamps page numbers below 1 to the first page', async () => {
		const res = await request(app).get('/getposts?page=0');
		expect(res.body.posts[0].id).toBe(23);
	});
});

// --- GET /getpost ----------------------------------------------------------

describe('GET /getpost', () => {
	test('returns a single post with its messages', async () => {
		const res = await request(app).get('/getpost?post=5');
		expect(res.status).toBe(200);
		expect(res.body.title).toBe('Post Title 5');
		expect(res.body.messages).toHaveLength(3);
	});

	test('returns 400 when the post parameter is missing', async () => {
		expect((await request(app).get('/getpost')).status).toBe(400);
	});

	test('returns 404 for a post that does not exist', async () => {
		expect((await request(app).get('/getpost?post=999')).status).toBe(404);
	});
});

// --- POST /signup ----------------------------------------------------------

describe('POST /signup', () => {
	test('creates a user, sets session cookies and stores only a bcrypt hash', async () => {
		const res = await request(app).post('/signup')
			.send({ username: 'bob', password: 'pw12345', realname: 'Bob' });
		expect(res.status).toBe(200);
		expect(cookiePairs(res).some(c => c.startsWith('session='))).toBe(true);
		expect(cookiePairs(res)).toContain('username=bob');

		const user = await User.findOne({ username: 'bob' });
		expect(user.passhash).not.toBe('pw12345');
		expect(await bcrypt.compare('pw12345', user.passhash)).toBe(true);
	});

	test('rejects a duplicate username', async () => {
		await signedInAgent('bob');
		const res = await request(app).post('/signup')
			.send({ username: 'bob', password: 'other', realname: 'Bob 2' });
		expect(res.status).toBe(400);
	});

	test('rejects a request with missing fields', async () => {
		const res = await request(app).post('/signup').send({ username: 'bob' });
		expect(res.status).toBe(400);
	});
});

// --- POST /login -----------------------------------------------------------

describe('POST /login', () => {
	beforeEach(async () => { await signedInAgent('carol', 'correct-pw'); });

	test('logs in with the correct password', async () => {
		const res = await request(app).post('/login').send({ username: 'carol', password: 'correct-pw' });
		expect(res.status).toBe(200);
		expect(cookiePairs(res)).toContain('username=carol');
	});

	test('rejects a wrong password', async () => {
		const res = await request(app).post('/login').send({ username: 'carol', password: 'nope' });
		expect(res.status).toBe(400);
	});

	test('rejects an unknown username', async () => {
		const res = await request(app).post('/login').send({ username: 'ghost', password: 'x' });
		expect(res.status).toBe(400);
	});
});

// --- POST /createpost ------------------------------------------------------

describe('POST /createpost', () => {
	test('requires login', async () => {
		const res = await request(app).post('/createpost').send({ postTitle: 't', postBody: 'b' });
		expect(res.status).toBe(401);
	});

	test('rejects a forged session cookie', async () => {
		await signedInAgent('alice');
		const res = await request(app).post('/createpost')
			.set('Cookie', ['username=alice', 'session=forged-value'])
			.send({ postTitle: 't', postBody: 'b' });
		expect(res.status).toBe(401);
	});

	test('rejects a post without title or body', async () => {
		const { agent } = await signedInAgent();
		expect((await agent.post('/createpost').send({ postTitle: 'only title' })).status).toBe(400);
	});

	test('creates a post with the next id and the logged-in author', async () => {
		const { agent } = await signedInAgent('alice');
		const res = await agent.post('/createpost').send({ postTitle: 'Hello', postBody: 'First!' });
		expect(res.status).toBe(200);
		expect(res.body.id).toBe(24);

		const post = (await request(app).get('/getpost?post=24')).body;
		expect(post.author).toBe('alice');
		expect(post.messages[0].body).toBe('First!');
	});
});

// --- POST /createpostreply -------------------------------------------------

describe('POST /createpostreply', () => {
	test('requires login', async () => {
		const res = await request(app).post('/createpostreply').send({ postID: 1, replyBody: 'hi' });
		expect(res.status).toBe(401);
	});

	test('appends a reply to an existing post', async () => {
		const { agent } = await signedInAgent('dave');
		expect((await agent.post('/createpostreply').send({ postID: 1, replyBody: 'Nice post' })).status).toBe(200);

		const post = (await request(app).get('/getpost?post=1')).body;
		expect(post.messages).toHaveLength(4);
		expect(post.messages[3]).toMatchObject({ body: 'Nice post', author: 'dave' });
	});

	test('returns 404 for a post that does not exist', async () => {
		const { agent } = await signedInAgent();
		expect((await agent.post('/createpostreply').send({ postID: 999, replyBody: 'x' })).status).toBe(404);
	});

	test('returns 400 when the reply body is missing', async () => {
		const { agent } = await signedInAgent();
		expect((await agent.post('/createpostreply').send({ postID: 1 })).status).toBe(400);
	});
});

// --- POST /deletepost ------------------------------------------------------

describe('POST /deletepost', () => {
	test('lets the author delete their own post', async () => {
		const { agent } = await signedInAgent('erin');
		const { id } = (await agent.post('/createpost').send({ postTitle: 'temp', postBody: 'x' })).body;

		expect((await agent.post('/deletepost').send({ postID: id })).status).toBe(200);
		expect((await request(app).get('/getpost?post=' + id)).status).toBe(404);
	});

	test("forbids deleting someone else's post", async () => {
		const { agent } = await signedInAgent('mallory');
		expect((await agent.post('/deletepost').send({ postID: 1 })).status).toBe(403); // post 1 belongs to user1
		expect((await request(app).get('/getpost?post=1')).status).toBe(200);
	});

	test('returns 404 for a post that does not exist', async () => {
		const { agent } = await signedInAgent();
		expect((await agent.post('/deletepost').send({ postID: 999 })).status).toBe(404);
	});

	test('returns 400 when postID is missing', async () => {
		const { agent } = await signedInAgent();
		expect((await agent.post('/deletepost').send({})).status).toBe(400);
	});
});

// --- POST /logout ----------------------------------------------------------

describe('POST /logout', () => {
	test('requires login', async () => {
		expect((await request(app).post('/logout')).status).toBe(401);
	});

	test('invalidates the session so the old cookie stops working', async () => {
		const { agent, cookies } = await signedInAgent('frank');
		expect((await agent.post('/logout')).status).toBe(200);

		// Replaying the pre-logout cookies must not authenticate
		const res = await request(app).post('/createpost')
			.set('Cookie', cookies)
			.send({ postTitle: 't', postBody: 'b' });
		expect(res.status).toBe(401);
	});
});

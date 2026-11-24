// Unit tests for the seed-data generator (no database needed)
const data_posts = require('../data.js');

describe('data_posts()', () => {
	test('generates the requested number of posts', () => {
		expect(data_posts(23)).toHaveLength(23);
		expect(data_posts(0)).toHaveLength(0);
	});

	test('assigns sequential ids starting at 1', () => {
		const ids = data_posts(5).map(p => p.id);
		expect(ids).toEqual([1, 2, 3, 4, 5]);
	});

	test('gives every post a title, author, date and 3 messages', () => {
		for (const post of data_posts(10)) {
			expect(post.title).toBe('Post Title ' + post.id);
			expect(post.author).toBe('user' + post.id);
			expect(post.created).toBeInstanceOf(Date);
			expect(post.messages).toHaveLength(3);
			post.messages.forEach(m => {
				expect(typeof m.body).toBe('string');
				expect(typeof m.author).toBe('string');
			});
		}
	});
});

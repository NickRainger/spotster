import type { Track } from './types';

/** Fake Hitster-style deck — years span decades so timelines matter without Spotify */
export const MOCK_DECK: Track[] = [
	{ id: 't01', title: 'Billie Jean', artist: 'Michael Jackson', year: 1983, mockColor: '#e11d48' },
	{ id: 't02', title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991, mockColor: '#f59e0b' },
	{ id: 't03', title: 'Hey Jude', artist: 'The Beatles', year: 1968, mockColor: '#0ea5e9' },
	{ id: 't04', title: 'Crazy in Love', artist: 'Beyoncé', year: 2003, mockColor: '#a855f7' },
	{ id: 't05', title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, mockColor: '#22c55e' },
	{ id: 't06', title: 'Blinding Lights', artist: 'The Weeknd', year: 2019, mockColor: '#ef4444' },
	{ id: 't07', title: 'Toxic', artist: 'Britney Spears', year: 2003, mockColor: '#ec4899' },
	{ id: 't08', title: 'Wonderwall', artist: 'Oasis', year: 1995, mockColor: '#84cc16' },
	{ id: 't09', title: 'Superstition', artist: 'Stevie Wonder', year: 1972, mockColor: '#f97316' },
	{ id: 't10', title: 'Lose Yourself', artist: 'Eminem', year: 2002, mockColor: '#64748b' },
	{ id: 't11', title: 'Dancing Queen', artist: 'ABBA', year: 1976, mockColor: '#eab308' },
	{ id: 't12', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', year: 2014, mockColor: '#14b8a6' },
	{ id: 't13', title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', year: 1987, mockColor: '#dc2626' },
	{ id: 't14', title: 'Somebody That I Used to Know', artist: 'Gotye', year: 2011, mockColor: '#6366f1' },
	{ id: 't15', title: 'Stayin\' Alive', artist: 'Bee Gees', year: 1977, mockColor: '#fbbf24' },
	{ id: 't16', title: 'Seven Nation Army', artist: 'The White Stripes', year: 2003, mockColor: '#1e293b' },
	{ id: 't17', title: 'Like a Prayer', artist: 'Madonna', year: 1989, mockColor: '#c026d3' },
	{ id: 't18', title: 'Take On Me', artist: 'a-ha', year: 1985, mockColor: '#38bdf8' },
	{ id: 't19', title: 'Rolling in the Deep', artist: 'Adele', year: 2010, mockColor: '#b91c1c' },
	{ id: 't20', title: 'Mr. Brightside', artist: 'The Killers', year: 2004, mockColor: '#f43f5e' },
	{ id: 't21', title: 'Thriller', artist: 'Michael Jackson', year: 1982, mockColor: '#7c3aed' },
	{ id: 't22', title: 'Shape of You', artist: 'Ed Sheeran', year: 2017, mockColor: '#059669' },
	{ id: 't23', title: 'Hotel California', artist: 'Eagles', year: 1977, mockColor: '#92400e' },
	{ id: 't24', title: 'Bad Guy', artist: 'Billie Eilish', year: 2019, mockColor: '#4ade80' },
	{ id: 't25', title: 'I Want to Break Free', artist: 'Queen', year: 1984, mockColor: '#2563eb' },
	{ id: 't26', title: 'Vogue', artist: 'Madonna', year: 1990, mockColor: '#db2777' },
	{ id: 't27', title: 'Clocks', artist: 'Coldplay', year: 2002, mockColor: '#0d9488' },
	{ id: 't28', title: 'Levitating', artist: 'Dua Lipa', year: 2020, mockColor: '#f472b6' },
	{ id: 't29', title: 'Purple Rain', artist: 'Prince', year: 1984, mockColor: '#7e22ce' },
	{ id: 't30', title: 'As It Was', artist: 'Harry Styles', year: 2022, mockColor: '#67e8f9' },
	{ id: 't31', title: 'No Diggity', artist: 'Blackstreet', year: 1996, mockColor: '#a16207' },
	{ id: 't32', title: 'Zombie', artist: 'The Cranberries', year: 1994, mockColor: '#15803d' },
	{ id: 't33', title: 'Firework', artist: 'Katy Perry', year: 2010, mockColor: '#fb923c' },
	{ id: 't34', title: 'SexyBack', artist: 'Justin Timberlake', year: 2006, mockColor: '#334155' },
	{ id: 't35', title: 'September', artist: 'Earth, Wind & Fire', year: 1978, mockColor: '#ca8a04' },
	{ id: 't36', title: 'Despacito', artist: 'Luis Fonsi', year: 2017, mockColor: '#ea580c' },
	{ id: 't37', title: 'Enter Sandman', artist: 'Metallica', year: 1991, mockColor: '#111827' },
	{ id: 't38', title: 'Call Me Maybe', artist: 'Carly Rae Jepsen', year: 2011, mockColor: '#f9a8d4' },
	{ id: 't39', title: 'Imagine', artist: 'John Lennon', year: 1971, mockColor: '#93c5fd' },
	{ id: 't40', title: 'Flowers', artist: 'Miley Cyrus', year: 2023, mockColor: '#fde047' }
];

export function shuffledDeck(seed = Date.now()): Track[] {
	const arr = [...MOCK_DECK];
	let s = seed % 2147483647;
	if (s <= 0) s += 2147483646;
	for (let i = arr.length - 1; i > 0; i--) {
		s = (s * 16807) % 2147483647;
		const j = s % (i + 1);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

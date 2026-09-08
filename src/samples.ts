export interface Sample {
  id: string
  label: string
  broken?: boolean
  text: string
}

export const SAMPLES: Sample[] = [
  {
    id: 'manifest',
    label: 'Package manifest',
    text: `{
  "name": "bracketwise",
  "version": "1.0.0",
  "private": true,
  "description": "A hand-written JSON parser with exact error positions.",
  "keywords": ["json", "parser", "ast"],
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "contributors": [
    { "name": "Ada", "commits": 214, "active": true },
    { "name": "Grace", "commits": 97, "active": false }
  ],
  "homepage": null
}
`,
  },
  {
    id: 'geojson',
    label: 'GeoJSON feature',
    text: `{
  "type": "Feature",
  "id": 7,
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [[100.0, 0.0], [101.0, 0.0], [101.0, 1.0], [100.0, 1.0], [100.0, 0.0]]
    ]
  },
  "properties": {
    "name": "Marker Field",
    "elevation": 1.25e2,
    "tags": ["park", "water"],
    "visited": false
  }
}
`,
  },
  {
    id: 'escapes',
    label: 'Escapes & numbers',
    text: `{
  "plain": "Bracketwise",
  "quotes": "She said \\"hi\\" and left.",
  "path": "C:\\\\Users\\\\jafn\\\\notes.txt",
  "unicode": "caf\\u00e9 \\u2014 na\\u00efve",
  "emoji": "\\ud83d\\ude00 grinning face",
  "control": "tab\\tnewline\\nend",
  "numbers": [0, -0, 42, -17, 3.14159, 2.5e3, 1E-7, -6.02e+23],
  "empties": { "object": {}, "array": [], "string": "" }
}
`,
  },
  {
    id: 'trailing',
    label: 'Broken: trailing commas & comment',
    broken: true,
    text: `{
  "theme": "paper",
  "fonts": ["JetBrains Mono", "Fraunces",],
  // TODO: remove before shipping
  "indent": 2,
}
`,
  },
  {
    id: 'commas',
    label: 'Broken: missing comma & bare key',
    broken: true,
    text: `{
  "id": 42
  "label": "forty-two",
  status: "active",
  "tags": ["a" "b"]
}
`,
  },
  {
    id: 'strings',
    label: 'Broken: numbers, literal & open string',
    broken: true,
    text: `{
  "price": 019.99,
  "ratio": .5,
  "ok": True,
  "title": "Unfinished thought
}
`,
  },
]

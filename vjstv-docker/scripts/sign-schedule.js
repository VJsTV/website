#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const key = process.env.SCHEDULE_SIGNING_KEY;
if (!key) { console.error('SCHEDULE_SIGNING_KEY not set'); process.exit(1); }

const inputFile  = process.argv[2] || path.join(__dirname, '../schedule/schedule.json');
const outputFile = process.argv[3] || inputFile;

const payload = fs.readFileSync(inputFile, 'utf8');
JSON.parse(payload); // validate

const sig = crypto.createHmac('sha256', key).update(payload).digest('hex');
const envelope = JSON.stringify({ alg: 'hmac-sha256', sig, payload: JSON.parse(payload) }, null, 2);

fs.writeFileSync(outputFile, envelope);
console.log(`Signed → ${outputFile}  sig=${sig.slice(0, 16)}…`);

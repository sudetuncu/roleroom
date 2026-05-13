const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf-8');

// Replace io.emit with io.to(roomCode).emit
content = content.replace(/io\.emit\(/g, 'io.to(roomCode).emit(');

// Add roomCode to function signatures and calls
const funcs = [
  'generateScenarioFromAI',
  'assignRolesForCurrentRound',
  'assignSecretQuests',
  'generateDynamicEvent',
  'maybeTriggerDynamicEvent',
  'resolveVotes',
  'evaluateRoundWithAI',
  'applyRoundEvaluation',
  'startRound',
  'finishRoundAndStartNext',
  'broadcastState'
];

funcs.forEach(func => {
  // Update function definitions
  const defRegex = new RegExp(`function ${func}\\((.*?)\\)\\s*{`, 'g');
  content = content.replace(defRegex, (match, args) => {
    if (args.trim() === '') return `function ${func}(roomCode) {`;
    if (args.includes('roomCode')) return match;
    return `function ${func}(${args}, roomCode) {`;
  });
  
  const asyncDefRegex = new RegExp(`async function ${func}\\((.*?)\\)\\s*{`, 'g');
  content = content.replace(asyncDefRegex, (match, args) => {
    if (args.trim() === '') return `async function ${func}(roomCode) {`;
    if (args.includes('roomCode')) return match;
    return `async function ${func}(${args}, roomCode) {`;
  });
});

// Fix state access in all these functions
const stateVars = [
  'roundEndsAt',
  'roundNumber',
  'currentScenario',
  'currentRoundRoles',
  'roundMessages',
  'roundLifecycleRunning',
  'dynamicEventActive',
  'dynamicEventText',
  'dynamicEventEndsAt',
  'secretQuests',
  'votingActive',
  'votes'
];

stateVars.forEach(v => {
  const regex = new RegExp(`\\b${v}\\b`, 'g');
  content = content.replace(regex, `state.${v}`);
});

// Add `const state = getRoomState(roomCode);` at the beginning of each function
funcs.forEach(func => {
  const defRegex = new RegExp(`(async )?function ${func}\\(.*?roomCode.*?\\)\\s*{`, 'g');
  content = content.replace(defRegex, (match) => {
    return `${match}\n  const state = getRoomState(roomCode);`;
  });
});

// Fix specific usages like db.getActiveUsersOrderedByScore() -> db.getActiveUsersOrderedByScore(roomCode)
content = content.replace(/db\.getActiveUsersOrderedByScore\(\)/g, 'db.getActiveUsersOrderedByScore(roomCode)');
content = content.replace(/db\.getRecentMessages\(\)/g, 'db.getRecentMessages(roomCode)');

// Fix setIntervals
const setIntervalReplacement = `// Room-based intervals
setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  for (const [roomCode, state] of rooms.entries()) {
    if (state.dynamicEventActive && Date.now() >= state.dynamicEventEndsAt) {
      state.dynamicEventActive = false;
      state.dynamicEventText = '';
      io.to(roomCode).emit('dynamic_event_end');
    }
    maybeTriggerDynamicEvent(roomCode).catch(console.error);
  }
}, 15000);

setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  for (const [roomCode, state] of rooms.entries()) {
    if (Date.now() >= state.roundEndsAt) {
      finishRoundAndStartNext(roomCode).catch((err) => {
        console.error('Round lifecycle error:', err?.message || err);
      });
      continue;
    }
    broadcastState(roomCode);
  }
}, 1000);`;

content = content.replace(/\/\/ Dynamic event timer[\s\S]*?(?=io\.on\('connection')/, setIntervalReplacement + '\n\n');

fs.writeFileSync('server.js', content, 'utf-8');

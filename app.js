/* Janggi (Korean chess) - local 2-player PWA
   Board: 9 files (x=0..8), 10 ranks (y=0..9). y=0 is top (초), y=9 is bottom (한/홍).
   Pieces:
     g: General(將/帥), a: Guard(士), e: Elephant(象), h: Horse(馬), r: Chariot(車), c: Cannon(包/砲), s: Soldier(卒/兵)
   Side:
     'R' (red, bottom), 'B' (blue, top)
*/

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const kiboEl = document.getElementById('kibo');
const modeEl = document.getElementById('mode');

const BTN = {
  new: document.getElementById('btnNew'),
  undo: document.getElementById('btnUndo'),
  flip: document.getElementById('btnFlip'),
  copy: document.getElementById('btnCopy'),
  paste: document.getElementById('btnPaste'),
};

let gameMode = 'local'; // 'local' | 'cpu'
let humanSide = 'R';
let cpuSide = 'B';
let cpuThinking = false;

const W = canvas.width;
const H = canvas.height;
const PAD = 40;
const GRID_W = W - PAD*2;
const GRID_H = H - PAD*2;
const CELL = GRID_W / 8; // x step (9 points => 8 intervals)
const CELL_Y = GRID_H / 9; // y step (10 points => 9 intervals)

let flipped = false;

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function inside(x,y){ return x>=0 && x<=8 && y>=0 && y<=9; }

function palaceOf(side){
  // (x=3..5) and y=7..9 for Red, y=0..2 for Blue
  if (side==='R') return {x0:3,x1:5,y0:7,y1:9};
  return {x0:3,x1:5,y0:0,y1:2};
}
function inPalace(side,x,y){
  const p = palaceOf(side);
  return x>=p.x0 && x<=p.x1 && y>=p.y0 && y<=p.y1;
}

function riverCrossed(side,y){
  // river between y=4 and y=5
  if (side==='R') return y<=4;
  return y>=5;
}

function initialState(){
  const empty = Array.from({length:10},()=>Array(9).fill(null));
  const put = (x,y,side,type)=>{ empty[y][x]={side,type}; };

  // Blue (top)
  put(4,1,'B','g');
  put(3,0,'B','a'); put(5,0,'B','a');
  put(2,0,'B','e'); put(6,0,'B','e');
  put(1,0,'B','h'); put(7,0,'B','h');
  put(0,0,'B','r'); put(8,0,'B','r');
  put(1,2,'B','c'); put(7,2,'B','c');
  [0,2,4,6,8].forEach(x=>put(x,3,'B','s'));

  // Red (bottom)
  put(4,8,'R','g');
  put(3,9,'R','a'); put(5,9,'R','a');
  put(2,9,'R','e'); put(6,9,'R','e');
  put(1,9,'R','h'); put(7,9,'R','h');
  put(0,9,'R','r'); put(8,9,'R','r');
  put(1,7,'R','c'); put(7,7,'R','c');
  [0,2,4,6,8].forEach(x=>put(x,6,'R','s'));

  return {
    board: empty,
    turn: 'R',
    history: [], // {from:{x,y},to:{x,y},piece,cap,turnBefore}
    kibo: [], // simple notation
  };
}

let S = initialState();
let selected = null; // {x,y}
let legalTargets = []; // [{x,y}]

function other(side){ return side==='R'?'B':'R'; }

function pieceLabel(p){
  // 한자 표기 (초/한 표기 관행)
  // Blue(초): 將 士 象 馬 車 包 卒
  // Red(한): 帥 仕 相 馬 車 砲 兵
  const blue = {g:'將',a:'士',e:'象',h:'馬',r:'車',c:'包',s:'卒'};
  const red  = {g:'帥',a:'仕',e:'相',h:'馬',r:'車',c:'砲',s:'兵'};
  return (p.side==='R'?red:blue)[p.type] || '?';
}

function toScreen(x,y){
  // board intersections
  const xx = PAD + x*CELL;
  const yy = PAD + y*CELL_Y;
  if (!flipped) return {x:xx,y:yy};
  // flip both axes for perspective
  return {x: PAD + (8-x)*CELL, y: PAD + (9-y)*CELL_Y};
}
function toBoard(px,py){
  // snap to nearest intersection
  let x = Math.round((px-PAD)/CELL);
  let y = Math.round((py-PAD)/CELL_Y);
  x = Math.max(0,Math.min(8,x));
  y = Math.max(0,Math.min(9,y));
  if (!flipped) return {x,y};
  return {x: 8-x, y: 9-y};
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0,0,W,H);

  // grid
  ctx.strokeStyle = 'rgba(200,210,255,0.28)';
  ctx.lineWidth = 2;

  // draw outer border
  ctx.strokeRect(PAD, PAD, GRID_W, GRID_H);

  // vertical lines
  for (let x=0;x<9;x++){
    const a = toScreen(x,0);
    const b = toScreen(x,9);
    // Because toScreen flips, endpoints may be inverted; draw by coords directly in unflipped space:
  }
  // Draw in unflipped coord system for simplicity
  // We'll temporarily ignore flip by drawing from PAD grid positions; flip affects piece coordinates only.
  ctx.save();
  ctx.strokeStyle = 'rgba(200,210,255,0.25)';
  ctx.lineWidth = 2;
  for (let x=0;x<9;x++){
    const xx = PAD + x*CELL;
    ctx.beginPath();
    ctx.moveTo(xx, PAD);
    ctx.lineTo(xx, PAD+GRID_H);
    ctx.stroke();
  }
  for (let y=0;y<10;y++){
    const yy = PAD + y*CELL_Y;
    ctx.beginPath();
    ctx.moveTo(PAD, yy);
    ctx.lineTo(PAD+GRID_W, yy);
    ctx.stroke();
  }

  // river label
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.font = '700 28px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚 河', PAD + GRID_W*0.25, PAD + GRID_H*0.5);
  ctx.fillText('漢 界', PAD + GRID_W*0.75, PAD + GRID_H*0.5);

  // palaces diagonals
  const drawPalace = (x0,y0)=>{
    const p = (x,y)=>({x: PAD + x*CELL, y: PAD + y*CELL_Y});
    const a = p(x0,y0);
    const b = p(x0+2,y0+2);
    const c = p(x0+2,y0);
    const d = p(x0,y0+2);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.stroke();
  };
  ctx.strokeStyle = 'rgba(200,210,255,0.35)';
  drawPalace(3,0);
  drawPalace(3,7);
  ctx.restore();

  // highlights
  if (selected){
    const s = toScreen(selected.x, selected.y);
    drawDot(s.x,s.y, 18, 'rgba(255,224,138,0.35)', 'rgba(255,224,138,0.85)');
  }
  for (const t of legalTargets){
    const p = toScreen(t.x,t.y);
    drawDot(p.x,p.y, 14, 'rgba(255,224,138,0.20)', 'rgba(255,224,138,0.65)');
  }

  // pieces
  for (let y=0;y<10;y++){
    for (let x=0;x<9;x++){
      const piece = S.board[y][x];
      if (!piece) continue;
      const p = toScreen(x,y);
      drawPiece(p.x,p.y,piece);
    }
  }
}

function drawDot(x,y,r,fill,stroke){
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawPiece(x,y,piece){
  const isRed = piece.side==='R';
  const base = isRed ? 'rgba(255,107,107,0.18)' : 'rgba(77,163,255,0.18)';
  const stroke = isRed ? 'rgba(255,107,107,0.85)' : 'rgba(77,163,255,0.85)';

  ctx.beginPath();
  ctx.arc(x,y, 34, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(10,14,26,0.85)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x,y, 30, 0, Math.PI*2);
  ctx.fillStyle = base;
  ctx.fill();

  ctx.fillStyle = isRed ? '#ffd7d7' : '#d7ecff';
  ctx.font = '800 26px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pieceLabel(piece), x, y+1);
}

function findGeneral(side, board=S.board){
  for (let y=0;y<10;y++) for (let x=0;x<9;x++){
    const p = board[y][x];
    if (p && p.side===side && p.type==='g') return {x,y};
  }
  return null;
}

function generalsFace(board){
  const gR = findGeneral('R', board);
  const gB = findGeneral('B', board);
  if (!gR || !gB) return false;
  if (gR.x !== gB.x) return false;
  const x = gR.x;
  const y0 = Math.min(gR.y, gB.y);
  const y1 = Math.max(gR.y, gB.y);
  for (let y=y0+1; y<y1; y++){
    if (board[y][x]) return false;
  }
  return true;
}

function pseudoMovesForPiece(board, x,y){
  const piece = board[y][x];
  if (!piece) return [];
  const side = piece.side;
  const out = [];
  const push = (nx,ny)=>{ if(inside(nx,ny)) out.push({x:nx,y:ny}); };

  if (piece.type==='g' || piece.type==='a'){
    // 1-step orthogonal inside palace, plus diagonals along palace lines.
    const steps = [
      {dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},
    ];
    const diag = [
      {dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}
    ];
    for (const s of steps){
      const nx=x+s.dx, ny=y+s.dy;
      if (inPalace(side,nx,ny)) push(nx,ny);
    }
    // diagonals are only allowed within palace too
    for (const s of diag){
      const nx=x+s.dx, ny=y+s.dy;
      if (!inPalace(side,nx,ny)) continue;
      // In Janggi, diagonals are allowed if the move is along palace diagonals; practically within palace works.
      push(nx,ny);
    }
  }

  if (piece.type==='r'){
    // rook-like, plus palace diagonals when on palace intersections along diagonal lines
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    for (const d of dirs){
      let nx=x+d.dx, ny=y+d.dy;
      while (inside(nx,ny)){
        push(nx,ny);
        if (board[ny][nx]) break;
        nx+=d.dx; ny+=d.dy;
      }
    }
    // palace diagonals
    const diagDirs = [{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];
    for (const d of diagDirs){
      let nx=x+d.dx, ny=y+d.dy;
      if (!inPalace(side,x,y) && !inPalace(other(side),x,y)) continue; // only inside either palace
      while (inside(nx,ny) && (inPalace('R',nx,ny) || inPalace('B',nx,ny))){
        push(nx,ny);
        if (board[ny][nx]) break;
        nx+=d.dx; ny+=d.dy;
      }
    }
  }

  if (piece.type==='c'){
    // cannon: like rook but must jump exactly one piece to capture; cannot capture cannon.
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    for (const d of dirs){
      let nx=x+d.dx, ny=y+d.dy;
      let jumped = false;
      while (inside(nx,ny)){
        const sq = board[ny][nx];
        if (!jumped){
          if (!sq){
            // non-capture move before jump
            push(nx,ny);
          } else {
            jumped = true;
          }
        } else {
          if (sq){
            // capture only if opponent and not cannon
            if (sq.side!==side && sq.type!=='c') push(nx,ny);
            break;
          } else {
            // after jump: can move to empty squares too (in Janggi cannon can move after screen)
            push(nx,ny);
          }
        }
        nx+=d.dx; ny+=d.dy;
      }
    }
    // palace diagonals for cannon: allowed similarly, with jump rules.
    const diagDirs = [{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];
    for (const d of diagDirs){
      if (!inPalace('R',x,y) && !inPalace('B',x,y)) continue;
      let nx=x+d.dx, ny=y+d.dy;
      let jumped=false;
      while (inside(nx,ny) && (inPalace('R',nx,ny) || inPalace('B',nx,ny))){
        const sq = board[ny][nx];
        if (!jumped){
          if (!sq) push(nx,ny); else jumped=true;
        } else {
          if (sq){
            if (sq.side!==side && sq.type!=='c') push(nx,ny);
            break;
          } else push(nx,ny);
        }
        nx+=d.dx; ny+=d.dy;
      }
    }
  }

  if (piece.type==='h'){
    // horse: (orth step then diag), blocked by adjacent orth square
    const patterns = [
      {dx:1,dy:2, bx:0,by:1}, {dx:-1,dy:2, bx:0,by:1},
      {dx:1,dy:-2,bx:0,by:-1},{dx:-1,dy:-2,bx:0,by:-1},
      {dx:2,dy:1, bx:1,by:0}, {dx:2,dy:-1,bx:1,by:0},
      {dx:-2,dy:1,bx:-1,by:0},{dx:-2,dy:-1,bx:-1,by:0},
    ];
    for (const ptn of patterns){
      const blockX = x+ptn.bx, blockY=y+ptn.by;
      const nx=x+ptn.dx, ny=y+ptn.dy;
      if (!inside(nx,ny)) continue;
      if (inside(blockX,blockY) && board[blockY][blockX]) continue;
      push(nx,ny);
    }
  }

  if (piece.type==='e'){
    // elephant: (orth, diag, diag) 3-step; blocked at 1st and 2nd intermediate
    const patterns = [
      {dx:2,dy:3, b1:{dx:0,dy:1}, b2:{dx:1,dy:2}},
      {dx:-2,dy:3,b1:{dx:0,dy:1}, b2:{dx:-1,dy:2}},
      {dx:2,dy:-3,b1:{dx:0,dy:-1},b2:{dx:1,dy:-2}},
      {dx:-2,dy:-3,b1:{dx:0,dy:-1},b2:{dx:-1,dy:-2}},
      {dx:3,dy:2, b1:{dx:1,dy:0}, b2:{dx:2,dy:1}},
      {dx:3,dy:-2,b1:{dx:1,dy:0}, b2:{dx:2,dy:-1}},
      {dx:-3,dy:2,b1:{dx:-1,dy:0},b2:{dx:-2,dy:1}},
      {dx:-3,dy:-2,b1:{dx:-1,dy:0},b2:{dx:-2,dy:-1}},
    ];
    for (const ptn of patterns){
      const nx=x+ptn.dx, ny=y+ptn.dy;
      if (!inside(nx,ny)) continue;
      const b1x=x+ptn.b1.dx, b1y=y+ptn.b1.dy;
      const b2x=x+ptn.b2.dx, b2y=y+ptn.b2.dy;
      if (board[b1y]?.[b1x]) continue;
      if (board[b2y]?.[b2x]) continue;
      push(nx,ny);
    }
  }

  if (piece.type==='s'){
    // soldier: forward; after crossing river can move sideways. In palace can move diagonally forward.
    const dy = (side==='R') ? -1 : 1;
    push(x, y+dy);
    if (riverCrossed(side,y)){
      push(x-1,y);
      push(x+1,y);
    }
    // palace diagonals forward
    const nx1 = x-1, nx2 = x+1, ny = y+dy;
    if ((inPalace('R',x,y) || inPalace('B',x,y)) && (inPalace('R',nx1,ny) || inPalace('B',nx1,ny))) push(nx1,ny);
    if ((inPalace('R',x,y) || inPalace('B',x,y)) && (inPalace('R',nx2,ny) || inPalace('B',nx2,ny))) push(nx2,ny);
  }

  // filter off-board already ensured, but keep unique
  return out.filter((m,i,arr)=>arr.findIndex(z=>z.x===m.x && z.y===m.y)===i);
}

function attacks(board, side){
  // return set of attacked squares by side (pseudo-legal, ignoring self-check)
  const set = new Set();
  for (let y=0;y<10;y++) for (let x=0;x<9;x++){
    const p = board[y][x];
    if (!p || p.side!==side) continue;
    const moves = pseudoMovesForPiece(board,x,y);
    for (const m of moves){
      // for sliding pieces, pseudoMoves includes empty squares too; still count as attacked.
      set.add(m.x+','+m.y);
    }
  }
  return set;
}

function isInCheck(board, side){
  const g = findGeneral(side, board);
  if (!g) return false;
  const atk = attacks(board, other(side));
  if (atk.has(g.x+','+g.y)) return true;
  // flying general line counts as check too
  if (generalsFace(board)) return true;
  return false;
}

function legalMovesFrom(x,y){
  const piece = S.board[y][x];
  if (!piece) return [];
  if (piece.side !== S.turn) return [];

  const candidates = pseudoMovesForPiece(S.board,x,y)
    .filter(m=>{
      const t = S.board[m.y][m.x];
      // cannot capture own
      if (t && t.side===piece.side) return false;
      // cannon cannot capture cannon already handled in pseudo
      return true;
    });

  const legal = [];
  for (const m of candidates){
    const board2 = deepClone(S.board);
    board2[m.y][m.x] = board2[y][x];
    board2[y][x] = null;
    // illegal if generals face after move
    if (generalsFace(board2)) continue;
    // illegal if leaves own general in check
    if (isInCheck(board2, piece.side)) continue;
    legal.push(m);
  }
  return legal;
}

function move(from,to){
  const piece = S.board[from.y][from.x];
  if (!piece) return false;
  const targets = legalMovesFrom(from.x,from.y);
  if (!targets.some(t=>t.x===to.x && t.y===to.y)) return false;

  const cap = S.board[to.y][to.x];
  const turnBefore = S.turn;
  S.history.push({from,to,piece:deepClone(piece),cap:cap?deepClone(cap):null,turnBefore});

  S.board[to.y][to.x] = piece;
  S.board[from.y][from.x] = null;
  S.turn = other(S.turn);

  // kibo
  const note = `${turnBefore}${piece.type}:${from.x}${from.y}->${to.x}${to.y}${cap? 'x'+cap.type:''}`;
  S.kibo.push(note);
  kiboEl.value = S.kibo.join('\n');

  selected = null;
  legalTargets = [];
  updateStatus();
  draw();

  maybeCpuTurn();
  return true;
}

function undo(){
  if (cpuThinking) return;
  const last = S.history.pop();
  if (!last) return;
  const {from,to,piece,cap,turnBefore} = last;
  S.board[from.y][from.x] = piece;
  S.board[to.y][to.x] = cap;
  S.turn = turnBefore;
  S.kibo.pop();
  kiboEl.value = S.kibo.join('\n');

  // vs CPU 모드에서는 "내 수"까지 되돌릴 때 CPU 응수도 같이 되돌리기(가능하면)
  if (gameMode==='cpu' && S.history.length>0){
    const maybeCpu = S.history[S.history.length-1];
    if (maybeCpu && maybeCpu.turnBefore === cpuSide){
      const last2 = S.history.pop();
      S.board[last2.from.y][last2.from.x] = last2.piece;
      S.board[last2.to.y][last2.to.x] = last2.cap;
      S.turn = last2.turnBefore;
      S.kibo.pop();
      kiboEl.value = S.kibo.join('\n');
    }
  }

  selected = null;
  legalTargets = [];
  updateStatus();
  draw();
}

function newGame(){
  cpuThinking = false;
  S = initialState();
  selected = null;
  legalTargets = [];
  kiboEl.value = '';
  updateStatus();
  draw();
  maybeCpuTurn();
}

function updateStatus(){
  const sideName = (S.turn==='R') ? '홍(아래)' : '청(위)';
  const modeName = (gameMode==='cpu') ? '개인 vs PC' : '로컬 2인';
  let text = `${modeName} · ${sideName} 차례`;
  if (cpuThinking) text += ' · PC 생각중…';
  if (isInCheck(S.board, S.turn)) text += ' · 체크!';
  statusEl.textContent = text;
}

function onTapBoard(evt){
  if (cpuThinking) return;
  if (gameMode==='cpu' && S.turn===cpuSide) return;

  const rect = canvas.getBoundingClientRect();
  const px = (evt.clientX - rect.left) * (canvas.width/rect.width);
  const py = (evt.clientY - rect.top) * (canvas.height/rect.height);
  const b = toBoard(px,py);

  const p = S.board[b.y][b.x];

  if (selected){
    // try move
    if (legalTargets.some(t=>t.x===b.x && t.y===b.y)){
      move(selected, b);
      return;
    }
    // reselect own piece
    if (p && p.side===S.turn){
      selected = b;
      legalTargets = legalMovesFrom(b.x,b.y);
      draw();
      return;
    }
    // otherwise clear
    selected = null;
    legalTargets = [];
    draw();
    return;
  }

  if (p && p.side===S.turn){
    selected = b;
    legalTargets = legalMovesFrom(b.x,b.y);
    draw();
  }
}

canvas.addEventListener('click', onTapBoard);
canvas.addEventListener('touchend', (e)=>{
  // treat as click
  const t = e.changedTouches[0];
  onTapBoard({clientX:t.clientX, clientY:t.clientY});
  e.preventDefault();
}, {passive:false});

modeEl?.addEventListener('change', ()=>{
  gameMode = modeEl.value;
  newGame();
});

BTN.new.addEventListener('click', newGame);
BTN.undo.addEventListener('click', undo);
BTN.flip.addEventListener('click', ()=>{flipped=!flipped; draw();});
BTN.copy.addEventListener('click', async ()=>{
  try{
    await navigator.clipboard.writeText(kiboEl.value||'');
  }catch(e){
    // fallback: select
    kiboEl.focus();
    kiboEl.select();
  }
});
BTN.paste.addEventListener('click', async ()=>{
  let text='';
  try{
    text = await navigator.clipboard.readText();
  }catch(e){
    text = prompt('기보 텍스트를 붙여넣어 주세요');
  }
  if (!text) return;
  loadKibo(text);
});

function loadKibo(text){
  // very simple: replay moves from our internal notation
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  newGame();
  for (const line of lines){
    // format: Rr:xy->xyx?
    const m = line.match(/^([RB])([a-z]):(\d)(\d)->(\d)(\d)/);
    if (!m) continue;
    const from = {x:+m[3], y:+m[4]};
    const to = {x:+m[5], y:+m[6]};
    // force turn if mismatch by swapping (best effort)
    if (S.turn !== m[1]) S.turn = m[1];
    move(from,to);
  }
}

// --- CPU player (very simple) ---
const VALUE = {g:10000,r:130,c:70,h:50,e:35,a:30,s:15};
function allLegalMovesForSide(side){
  const moves=[];
  const turnSaved = S.turn;
  S.turn = side;
  for (let y=0;y<10;y++) for (let x=0;x<9;x++){
    const p = S.board[y][x];
    if (!p || p.side!==side) continue;
    const ts = legalMovesFrom(x,y);
    for (const t of ts) moves.push({from:{x,y}, to:{x:t.x,y:t.y}});
  }
  S.turn = turnSaved;
  return moves;
}
function scoreMove(m){
  const cap = S.board[m.to.y][m.to.x];
  let s = 0;
  if (cap) s += (VALUE[cap.type]||0) * 10;
  // prefer giving check
  const b2 = deepClone(S.board);
  b2[m.to.y][m.to.x] = b2[m.from.y][m.from.x];
  b2[m.from.y][m.from.x] = null;
  if (isInCheck(b2, other(cpuSide))) s += 25;
  return s + Math.random();
}
function cpuPlayOne(){
  const moves = allLegalMovesForSide(cpuSide);
  if (moves.length===0) return;
  moves.sort((a,b)=>scoreMove(b)-scoreMove(a));
  const best = moves[0];
  move(best.from, best.to);
}
function maybeCpuTurn(){
  if (gameMode!=='cpu') return;
  if (S.turn!==cpuSide) return;
  if (cpuThinking) return;
  cpuThinking = true;
  updateStatus();
  setTimeout(()=>{
    cpuPlayOne();
    cpuThinking = false;
    updateStatus();
    draw();
  }, 350);
}

updateStatus();
draw();
if (modeEl) { gameMode = modeEl.value || 'local'; }
maybeCpuTurn();

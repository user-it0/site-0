const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

// チャット履歴の永続保存用ファイル
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');
let chatHistory = {};
if (fs.existsSync(chatHistoryFile)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile));
  } catch (e) {
    console.error('Error reading chatHistory file:', e);
    chatHistory = {};
  }
}

// 簡易的なユーザーストア（メモリ上）
// 各ユーザー： { username, password, approvedFriends: [], friendRequests: [] }
let users = [];

// グループチャット用ストア（メモリ上）
// 各グループ： { groupId, groupName, members: [username, ...] }
let groups = [];

// ユーザー登録
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  let newUser = { username, password, approvedFriends: [], friendRequests: [] };
  users.push(newUser);
  res.json({ message: '登録成功', user: newUser });
});

// ログイン
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  let user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '認証失敗' });
  }
  res.json({ message: 'ログイン成功', user });
});

// 登録済みユーザー一覧（ログインユーザーは除外）
app.get('/users', (req, res) => {
  const { username } = req.query;
  const filtered = users.filter(u => u.username !== username).map(u => u.username);
  res.json({ users: filtered });
});

// 友達追加リクエスト送信（送信後、対象ユーザーへリアルタイム通知）
app.post('/sendFriendRequest', (req, res) => {
  const { from, to } = req.body;
  let targetUser = users.find(u => u.username === to);
  if (!targetUser) {
    return res.status(404).json({ error: '対象ユーザーが見つかりません' });
  }
  if (targetUser.friendRequests.includes(from)) {
    return res.status(400).json({ error: '既にリクエストを送信済みです' });
  }
  targetUser.friendRequests.push(from);
  // 対象ユーザーにSocket.IOで通知
  io.to(to).emit('newFriendRequest', { from });
  res.json({ message: '友達追加リクエストを送信しました' });
});

// 友達リクエスト一覧取得
app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ friendRequests: user.friendRequests });
});

// 友達リクエストへの応答（承認または拒否）
app.post('/respondFriendRequest', (req, res) => {
  const { username, from, response } = req.body;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  const index = user.friendRequests.indexOf(from);
  if (index === -1) {
    return res.status(400).json({ error: 'リクエストが存在しません' });
  }
  user.friendRequests.splice(index, 1);
  if (response === 'accept') {
    if (!user.approvedFriends.includes(from)) {
      user.approvedFriends.push(from);
    }
    let fromUser = users.find(u => u.username === from);
    if (fromUser && !fromUser.approvedFriends.includes(username)) {
      fromUser.approvedFriends.push(username);
    }
    res.json({ message: '友達追加リクエストを承認しました' });
  } else {
    res.json({ message: '友達追加リクエストを拒否しました' });
  }
});

// 承認済み友達一覧取得
app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ approvedFriends: user.approvedFriends });
});

// グループ作成（グループ名と参加メンバーの配列を受け取る）
app.post('/createGroup', (req, res) => {
  const { groupName, members } = req.body;
  const groupId = 'group-' + Date.now();
  const newGroup = { groupId, groupName, members };
  groups.push(newGroup);
  // 各参加者にグループ作成通知（リアルタイム更新用）
  newGroup.members.forEach(member => {
    io.to(member).emit('groupCreated', { group: newGroup });
  });
  res.json({ message: 'グループ作成成功', group: newGroup });
});

// チャット履歴取得（個別チャットの場合はユーザー同士、グループの場合はグループIDをキーにする）
app.get('/chatHistory', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: 'user1 and user2 are required' });
  }
  const conversationKey = [user1, user2].sort().join('|');
  const history = chatHistory[conversationKey] || [];
  res.json({ chatHistory: history });
});

// Socket.IO の接続処理
io.on('connection', (socket) => {
  console.log('a user connected');
  
  // ユーザー名を受け取り、そのユーザー専用のルームに参加（リアルタイム通知用）
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined their room');
  });
  
  // プライベートメッセージ送信（送信と同時にタイムスタンプ付与）
  socket.on('private message', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`Message from ${socket.username} to ${data.to}: ${data.message}`);
    io.to(data.to).emit('private message', { from: socket.username, message: data.message, timestamp });
    
    const conversationKey = [socket.username, data.to].sort().join('|');
    if (!chatHistory[conversationKey]) chatHistory[conversationKey] = [];
    const messageObj = { from: socket.username, to: data.to, message: data.message, timestamp };
    chatHistory[conversationKey].push(messageObj);
    fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), err => {
      if (err) console.error('Error saving chat history:', err);
    });
  });
  
  // グループメッセージ送信
  socket.on('group message', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`Group message from ${socket.username} in group ${data.groupId}: ${data.message}`);
    io.to(data.groupId).emit('group message', { from: socket.username, groupId: data.groupId, message: data.message, timestamp });
    
    if (!chatHistory[data.groupId]) chatHistory[data.groupId] = [];
    const messageObj = { from: socket.username, message: data.message, timestamp };
    chatHistory[data.groupId].push(messageObj);
    fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), err => {
      if (err) console.error('Error saving chat history:', err);
    });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

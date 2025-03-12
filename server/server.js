const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

// 永続的なチャット履歴保存用ファイルの設定
const chatHistoryFile = path.join(__dirname, 'chatHistory.json');
let chatHistory = {};

// 既存のチャット履歴を読み込む（ファイルが存在しない場合は空のオブジェクト）
if (fs.existsSync(chatHistoryFile)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile));
  } catch (e) {
    console.error('Error reading chatHistory file:', e);
    chatHistory = {};
  }
}

// 簡易的なメモリ上のユーザーストア
// 各ユーザーは { username, password, approvedFriends: [], friendRequests: [] } の形式
let users = [];

// グループ管理用（各グループは { groupName, members: [], history: [] } として管理）
let groups = {};

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  let newUser = { username, password, approvedFriends: [], friendRequests: [] };
  users.push(newUser);
  res.json({ message: '登録成功', user: newUser });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  let user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '認証失敗' });
  }
  res.json({ message: 'ログイン成功', user });
});

app.get('/users', (req, res) => {
  const { username } = req.query;
  const filtered = users.filter(u => u.username !== username).map(u => u.username);
  res.json({ users: filtered });
});

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
  res.json({ message: '友達追加リクエストを送信しました' });
  // 送信先ユーザーにリアルタイムで通知
  io.to(to).emit('new friend request', { from });
});

app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ friendRequests: user.friendRequests });
});

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
    io.to(username).emit('friend request responded', { from, response });
    io.to(from).emit('friend request responded', { from: username, response: 'accepted' });
  } else {
    res.json({ message: '友達追加リクエストを拒否しました' });
    io.to(from).emit('friend request responded', { from: username, response: 'declined' });
  }
});

app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  let user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }
  res.json({ approvedFriends: user.approvedFriends });
});

// 個別チャット履歴取得用エンドポイント
app.get('/chatHistory', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: 'user1 and user2 are required' });
  }
  const conversationKey = [user1, user2].sort().join('|');
  const history = chatHistory[conversationKey] || [];
  res.json({ chatHistory: history });
});

// グループチャット履歴取得用エンドポイント
app.get('/groupChatHistory', (req, res) => {
  const { groupId } = req.query;
  if (!groupId || !groups[groupId]) {
    return res.status(404).json({ error: 'グループが見つかりません' });
  }
  res.json({ chatHistory: groups[groupId].history || [] });
});

// Socket.IO によるリアルタイム処理
io.on('connection', (socket) => {
  console.log('a user connected');
  
  // 自身のルームに参加（個別通知用）
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined their room');
  });
  
  // 個別メッセージ送信
  socket.on('private message', (data) => {
    console.log(`Message from ${socket.username} to ${data.to}: ${data.message}`);
    const timestamp = new Date().toISOString();
    io.to(data.to).emit('private message', { from: socket.username, message: data.message, timestamp });
    
    // チャット履歴保存
    const conversationKey = [socket.username, data.to].sort().join('|');
    if (!chatHistory[conversationKey]) {
      chatHistory[conversationKey] = [];
    }
    const messageObj = { from: socket.username, to: data.to, message: data.message, timestamp };
    chatHistory[conversationKey].push(messageObj);
    fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
      if (err) console.error('Error saving chat history:', err);
    });
  });
  
  // グループ作成イベント
  socket.on('create group', (data) => {
    // data: { groupName, members }　※members は配列（グループに加える友達）
    const groupId = 'group-' + Date.now();
    groups[groupId] = {
      groupName: data.groupName,
      members: [socket.username, ...data.members],
      history: []
    };
    socket.join(groupId);
    groups[groupId].members.forEach(member => {
      io.to(member).emit('group created', { groupId, groupName: data.groupName, members: groups[groupId].members });
    });
  });
  
  // グループメッセージ送信
  socket.on('group message', (data) => {
    // data: { groupId, message }
    if (!groups[data.groupId]) return;
    const timestamp = new Date().toISOString();
    io.to(data.groupId).emit('group message', { groupId: data.groupId, from: socket.username, message: data.message, timestamp });
    if (!groups[data.groupId].history) groups[data.groupId].history = [];
    const messageObj = { from: socket.username, message: data.message, timestamp };
    groups[data.groupId].history.push(messageObj);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

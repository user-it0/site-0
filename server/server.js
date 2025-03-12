const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

// 永続チャット履歴用ファイル設定
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

// 簡易ユーザーストア（各ユーザー { username, password, approvedFriends: [], friendRequests: [] }）
let users = [];

// グループ管理（各グループ { groupId, groupName, members: [username, ...] }）
let groups = [];
let nextGroupId = 1;

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'ユーザー名は既に存在します' });
  }
  const newUser = { username, password, approvedFriends: [], friendRequests: [] };
  users.push(newUser);
  res.json({ message: '登録成功', user: newUser });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
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
  const targetUser = users.find(u => u.username === to);
  if (!targetUser) {
    return res.status(404).json({ error: '対象ユーザーが見つかりません' });
  }
  if (targetUser.friendRequests.includes(from)) {
    return res.status(400).json({ error: '既にリクエストを送信済みです' });
  }
  targetUser.friendRequests.push(from);
  // リアルタイム通知
  io.to(to).emit('new friend request', { from });
  res.json({ message: '友達追加リクエストを送信しました' });
});

app.get('/friendRequests', (req, res) => {
  const { username } = req.query;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ friendRequests: user.friendRequests });
});

app.post('/respondFriendRequest', (req, res) => {
  const { username, from, response } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  const index = user.friendRequests.indexOf(from);
  if (index === -1) return res.status(400).json({ error: 'リクエストが存在しません' });
  user.friendRequests.splice(index, 1);
  if (response === 'accept') {
    if (!user.approvedFriends.includes(from)) user.approvedFriends.push(from);
    const fromUser = users.find(u => u.username === from);
    if (fromUser && !fromUser.approvedFriends.includes(username)) {
      fromUser.approvedFriends.push(username);
    }
    return res.json({ message: '友達追加リクエストを承認しました' });
  } else {
    return res.json({ message: '友達追加リクエストを拒否しました' });
  }
});

app.get('/approvedFriends', (req, res) => {
  const { username } = req.query;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ approvedFriends: user.approvedFriends });
});

// グループ作成
app.post('/createGroup', (req, res) => {
  const { groupName, members } = req.body;
  if (!groupName || !Array.isArray(members) || members.length < 2) {
    return res.status(400).json({ error: 'グループ名と最低2名のメンバーが必要です' });
  }
  const groupId = nextGroupId++;
  const group = { groupId, groupName, members };
  groups.push(group);
  res.json({ message: 'グループが作成されました', group });
});

// グループ一覧取得
app.get('/groups', (req, res) => {
  const { username } = req.query;
  const userGroups = groups.filter(g => g.members.includes(username));
  res.json({ groups: userGroups });
});

// チャット履歴取得
// 個別チャット：user1 と user2 の組み合わせ
// グループチャット：groupId を指定（conversationKey: "group|groupId"）
app.get('/chatHistory', (req, res) => {
  if(req.query.groupId) {
    const conversationKey = `group|${req.query.groupId}`;
    const history = chatHistory[conversationKey] || [];
    return res.json({ chatHistory: history });
  }
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: 'user1 and user2 are required' });
  }
  const conversationKey = [user1, user2].sort().join('|');
  const history = chatHistory[conversationKey] || [];
  res.json({ chatHistory: history });
});

// Socket.IO イベント処理
io.on('connection', (socket) => {
  console.log('a user connected');

  // ユーザー専用ルームに参加
  socket.on('join', (username) => {
    socket.username = username;
    socket.join(username);
    console.log(username + ' joined their room');
  });
  // グループチャット用ルームに参加
  socket.on('join group', (groupId) => {
    socket.join(`group|${groupId}`);
  });
  // 個別チャットメッセージ
  socket.on('private message', (data) => {
    console.log(`Message from ${socket.username} to ${data.to}: ${data.message}`);
    io.to(data.to).emit('private message', { from: socket.username, message: data.message });
    const conversationKey = [socket.username, data.to].sort().join('|');
    if (!chatHistory[conversationKey]) chatHistory[conversationKey] = [];
    const messageObj = {
      from: socket.username,
      to: data.to,
      message: data.message,
      timestamp: new Date().toISOString()
    };
    chatHistory[conversationKey].push(messageObj);
    fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
      if (err) console.error('Error saving chat history:', err);
    });
  });
  // グループチャットメッセージ
  socket.on('group message', (data) => {
    const group = groups.find(g => g.groupId === data.groupId);
    if (group) {
      const conversationKey = `group|${data.groupId}`;
      if (!chatHistory[conversationKey]) chatHistory[conversationKey] = [];
      const messageObj = {
        from: socket.username,
        message: data.message,
        timestamp: new Date().toISOString()
      };
      chatHistory[conversationKey].push(messageObj);
      fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory, null, 2), (err) => {
        if (err) console.error('Error saving chat history:', err);
      });
      io.to(`group|${data.groupId}`).emit('group message', { groupId: data.groupId, from: socket.username, message: data.message, timestamp: messageObj.timestamp });
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

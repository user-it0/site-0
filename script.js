document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化（サーバーの URL に合わせる）
  const socket = io();

  // グローバル変数
  let currentUser = null;
  let currentChatTarget = null; // ユーザー名（文字列）またはグループオブジェクト（{groupId, groupName, members}）
  let isGroupChat = false;

  // DOM 要素取得
  const pageAuth = document.getElementById("page-auth");
  const loginForm = document.getElementById("form-login");
  const registrationForm = document.getElementById("form-register");
  const loginDiv = document.getElementById("login-form");
  const registrationDiv = document.getElementById("registration-form");
  const toRegistrationBtn = document.getElementById("to-registration");
  const toLoginBtn = document.getElementById("to-login");

  const pageHome = document.getElementById("page-home");
  const displayUsername = document.getElementById("display-username");
  const userSearchInput = document.getElementById("user-search");
  const searchResultUl = document.getElementById("search-result");
  const friendRequestsUl = document.getElementById("friend-requests");
  const contactListUl = document.getElementById("contact-list");
  const groupListUl = document.getElementById("group-list");

  const pageChat = document.getElementById("page-chat");
  const backToHomeBtn = document.getElementById("back-to-home");
  const messageHistory = document.getElementById("message-history");
  const chatInput = document.getElementById("chat-input");
  const sendMessageBtn = document.getElementById("send-message");

  // グループ作成モーダル要素
  const groupModal = document.getElementById("group-modal");
  const groupNameInput = document.getElementById("group-name");
  const groupMembersDiv = document.getElementById("group-members");
  const submitGroupBtn = document.getElementById("submit-group-btn");
  const closeGroupModalBtn = document.getElementById("close-group-modal");
  const createGroupBtn = document.getElementById("create-group-btn");

  /* ------------------------------
       イベントリスナー設定
  ------------------------------ */
  // フォーム切替
  toRegistrationBtn.addEventListener("click", function() {
    fadeOut(loginDiv, () => { registrationDiv.style.display = "block"; });
  });
  toLoginBtn.addEventListener("click", function() {
    fadeOut(registrationDiv, () => { loginDiv.style.display = "block"; });
  });

  // 新規ユーザー登録
  registrationForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    try {
      const res = await fetch('/server/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if(data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("登録成功: " + currentUser.username);
        showHomePage();
      }
    } catch(err) {
      console.error(err);
    }
  });

  // ログイン処理
  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    try {
      const res = await fetch('/server/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if(data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("ログイン成功: " + currentUser.username);
        showHomePage();
      }
    } catch(err) {
      console.error(err);
    }
  });

  // 友達追加リクエスト送信（ユーザー検索結果から）
  userSearchInput.addEventListener("input", async function() {
    const query = this.value.trim().toLowerCase();
    searchResultUl.innerHTML = "";
    if(query === "") return;
    try {
      const res = await fetch(`/server/users?username=${currentUser.username}`);
      const data = await res.json();
      const results = data.users.filter(u => u.toLowerCase().includes(query));
      results.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user;
        li.className = "contact-item";
        li.addEventListener("click", async function() {
          try {
            const res = await fetch('/server/sendFriendRequest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: currentUser.username, to: user })
            });
            const resultData = await res.json();
            alert(resultData.message || resultData.error);
          } catch(err) {
            console.error(err);
          }
        });
        searchResultUl.appendChild(li);
      });
    } catch(err) {
      console.error(err);
    }
  });

  // リアルタイム友達リクエスト受信
  socket.on('new friend request', (data) => {
    addFriendRequestItem(data.from);
  });

  // グループ作成ボタン
  createGroupBtn.addEventListener("click", function() {
    // モーダル内に連絡可能ユーザーリストのチェックボックスを作成
    groupMembersDiv.innerHTML = "";
    const approvedFriends = contactListUl.querySelectorAll(".contact-item");
    approvedFriends.forEach(item => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = item.textContent;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(item.textContent));
      groupMembersDiv.appendChild(label);
      groupMembersDiv.appendChild(document.createElement("br"));
    });
    groupNameInput.value = "";
    groupModal.style.display = "block";
  });
  closeGroupModalBtn.addEventListener("click", function() {
    groupModal.style.display = "none";
  });
  submitGroupBtn.addEventListener("click", async function() {
    const groupName = groupNameInput.value.trim();
    const checkboxes = groupMembersDiv.querySelectorAll("input[type='checkbox']");
    let members = [];
    checkboxes.forEach(chk => { if(chk.checked) members.push(chk.value); });
    // 自分もメンバーに追加
    if(currentUser) members.push(currentUser.username);
    if(groupName === "" || members.length < 2) {
      alert("グループ名と2名以上のメンバーが必要です");
      return;
    }
    try {
      const res = await fetch('/server/createGroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, members })
      });
      const data = await res.json();
      if(data.error) {
        alert(data.error);
      } else {
        alert(data.message);
        loadGroups();
        groupModal.style.display = "none";
      }
    } catch(err) {
      console.error(err);
    }
  });

  // ホーム画面表示
  function showHomePage() {
    displayUsername.value = currentUser.username;
    fadeOut(pageAuth, () => {
      pageHome.style.display = "block";
      fadeIn(pageHome);
    });
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
    loadGroups();
  }

  // 承認済み友達一覧取得
  async function loadApprovedFriends() {
    try {
      const res = await fetch(`/server/approvedFriends?username=${currentUser.username}`);
      const data = await res.json();
      renderApprovedFriends(data.approvedFriends);
    } catch(err) {
      console.error(err);
    }
  }
  function renderApprovedFriends(friends) {
    contactListUl.innerHTML = "";
    friends.forEach(friend => {
      const li = document.createElement("li");
      li.textContent = friend;
      li.className = "contact-item";
      li.addEventListener("click", function() {
         openChat(friend, false);
      });
      contactListUl.appendChild(li);
    });
  }

  // 友達リクエスト一覧取得
  async function loadFriendRequests() {
    try {
      const res = await fetch(`/server/friendRequests?username=${currentUser.username}`);
      const data = await res.json();
      friendRequestsUl.innerHTML = "";
      data.friendRequests.forEach(requester => {
        addFriendRequestItem(requester);
      });
    } catch(err) {
      console.error(err);
    }
  }
  function addFriendRequestItem(requester) {
    const li = document.createElement("li");
    li.textContent = requester;
    li.className = "contact-item";
    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "承認";
    acceptBtn.addEventListener("click", function() {
      respondFriendRequest(requester, 'accept');
    });
    const declineBtn = document.createElement("button");
    declineBtn.textContent = "拒否";
    declineBtn.addEventListener("click", function() {
      respondFriendRequest(requester, 'decline');
    });
    li.appendChild(acceptBtn);
    li.appendChild(declineBtn);
    friendRequestsUl.appendChild(li);
  }
  async function respondFriendRequest(from, response) {
    try {
      const res = await fetch('/server/respondFriendRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, from, response })
      });
      const data = await res.json();
      alert(data.message);
      loadFriendRequests();
      loadApprovedFriends();
    } catch(err) {
      console.error(err);
    }
  }

  // グループ一覧取得
  async function loadGroups() {
    try {
      const res = await fetch(`/server/groups?username=${currentUser.username}`);
      const data = await res.json();
      renderGroups(data.groups);
    } catch(err) {
      console.error(err);
    }
  }
  function renderGroups(groups) {
    groupListUl.innerHTML = "";
    groups.forEach(group => {
      const li = document.createElement("li");
      li.textContent = group.groupName;
      li.className = "contact-item";
      li.addEventListener("click", function() {
         openChat(group, true);
      });
      groupListUl.appendChild(li);
    });
  }

  // チャット画面を開く（ユーザー間またはグループ）
  function openChat(target, groupFlag) {
    isGroupChat = groupFlag;
    currentChatTarget = target; // string（個別） or object（グループ）
    fadeOut(pageHome, () => {
      pageChat.style.display = "block";
      fadeIn(pageChat);
    });
    messageHistory.innerHTML = "";
    if(isGroupChat) {
      // グループの場合、参加（ルーム join）
      socket.emit('join group', target.groupId);
      fetch(`/server/chatHistory?groupId=${target.groupId}`)
        .then(res => res.json())
        .then(data => renderChatHistory(data.chatHistory))
        .catch(err => console.error(err));
    } else {
      // 個別チャットの場合（user1とuser2）
      fetch(`/server/chatHistory?user1=${currentUser.username}&user2=${target}`)
        .then(res => res.json())
        .then(data => renderChatHistory(data.chatHistory))
        .catch(err => console.error(err));
    }
  }
  function renderChatHistory(historyArray) {
    if(historyArray && historyArray.length > 0) {
      historyArray.forEach(msgObj => {
        appendMessage(msgObj.from, msgObj.message, msgObj.timestamp);
      });
    } else {
      const welcome = { from: '', message: "チャット開始", timestamp: new Date().toISOString() };
      appendMessage('', welcome.message, welcome.timestamp);
    }
    messageHistory.scrollTop = messageHistory.scrollHeight;
  }

  // メッセージ送信処理
  sendMessageBtn.addEventListener("click", function() {
    const msg = chatInput.value.trim();
    if(msg === "" || currentChatTarget === null) return;
    const now = new Date().toISOString();
    appendMessage(currentUser.username, msg, now);
    if(isGroupChat) {
      socket.emit('group message', { groupId: currentChatTarget.groupId, message: msg });
    } else {
      socket.emit('private message', { to: currentChatTarget, message: msg });
    }
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  // 受信したプライベートメッセージの表示
  socket.on('private message', (data) => {
    if(!isGroupChat && data.from === currentChatTarget) {
      appendMessage(data.from, data.message, new Date().toISOString());
    }
  });
  // 受信したグループメッセージの表示
  socket.on('group message', (data) => {
    if(isGroupChat && data.groupId === currentChatTarget.groupId) {
      appendMessage(data.from, data.message, data.timestamp);
    }
  });

  // メッセージの追加（左右寄せ＋タイムスタンプ付き）
  function appendMessage(from, message, timestamp) {
    const div = document.createElement("div");
    div.classList.add("message");
    if(from === currentUser.username) {
      div.classList.add("message-self");
    } else {
      div.classList.add("message-other");
    }
    // メッセージ本文
    div.innerHTML = message;
    // タイムスタンプ
    const tsSpan = document.createElement("span");
    tsSpan.className = "timestamp";
    tsSpan.textContent = formatTimestamp(timestamp);
    div.appendChild(tsSpan);
    messageHistory.appendChild(div);
    messageHistory.scrollTop = messageHistory.scrollHeight;
  }
  function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  // ページ遷移用フェードアウト／フェードイン
  function fadeOut(element, callback) {
    element.style.opacity = 1;
    const fadeEffect = setInterval(() => {
      if (element.style.opacity > 0) {
        element.style.opacity -= 0.1;
      } else {
        clearInterval(fadeEffect);
        element.style.display = "none";
        if(callback) callback();
      }
    }, 30);
  }
  function fadeIn(element) {
    element.style.display = "block";
    element.style.opacity = 0;
    const fadeEffect = setInterval(() => {
      let opacity = parseFloat(element.style.opacity);
      if (opacity < 1) {
        element.style.opacity = opacity + 0.1;
      } else {
        clearInterval(fadeEffect);
      }
    }, 30);
  }
});

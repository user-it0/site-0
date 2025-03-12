document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化（接続先URLはサーバーのURLに合わせてください）
  const socket = io();

  // グローバル変数
  let currentUser = null;
  // currentChat: { type: "private" or "group", id: (username or groupId), name: 表示名 }
  let currentChat = { type: "private", id: null, name: "" };
  let groups = []; // 作成済みグループ情報

  // DOM要素取得
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

  // グループ作成モーダル用
  const openGroupModalBtn = document.getElementById("open-group-modal");
  const groupModal = document.getElementById("group-creation-modal");
  const closeGroupModalBtn = document.getElementById("close-group-modal");
  const groupNameInput = document.getElementById("group-name");
  const groupMembersDiv = document.getElementById("group-members");
  const createGroupBtn = document.getElementById("create-group-btn");

  /* ----- ページ切替用関数（フェードイン・アウト） ----- */
  function showPage(page) {
    // 全ページ非表示
    document.querySelectorAll(".page").forEach(p => {
      p.style.display = "none";
      p.classList.remove("active");
    });
    // 表示したいページを表示してフェードイン
    page.style.display = "block";
    setTimeout(() => page.classList.add("active"), 50);
  }

  /* ----- フォーム切替 ----- */
  toRegistrationBtn.addEventListener("click", function() {
    loginDiv.style.display = "none";
    registrationDiv.style.display = "block";
  });
  toLoginBtn.addEventListener("click", function() {
    registrationDiv.style.display = "none";
    loginDiv.style.display = "block";
  });

  /* ----- 新規ユーザー登録 ----- */
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

  /* ----- ログイン処理 ----- */
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

  /* ----- ホーム画面表示 ----- */
  function showHomePage() {
    displayUsername.value = currentUser.username;
    showPage(pageHome);
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
    loadGroups();
  }

  /* ----- 承認済み友達一覧取得とレンダリング ----- */
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
         // プライベートチャット開始
         openChat("private", friend, friend);
      });
      contactListUl.appendChild(li);
    });
  }

  /* ----- 友達リクエスト取得とレンダリング ----- */
  async function loadFriendRequests() {
    try {
      const res = await fetch(`/server/friendRequests?username=${currentUser.username}`);
      const data = await res.json();
      renderFriendRequests(data.friendRequests);
    } catch(err) {
      console.error(err);
    }
  }
  function renderFriendRequests(requests) {
    friendRequestsUl.innerHTML = "";
    requests.forEach(requester => {
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
    });
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

  /* ----- リアルタイムで新規友達リクエスト更新 ----- */
  socket.on('newFriendRequest', (data) => {
    // data: { from }
    loadFriendRequests();
  });

  /* ----- ユーザー検索 ----- */
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

  /* ----- グループ作成モーダル表示 ----- */
  openGroupModalBtn.addEventListener("click", function() {
    // グループ作成用に、承認済み友達一覧をチェックボックスで表示
    groupMembersDiv.innerHTML = "";
    // 利用可能な友達（既にレンダリング済みの承認済み友達から）
    Array.from(contactListUl.children).forEach(li => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = li.textContent;
      const label = document.createElement("label");
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(li.textContent));
      const div = document.createElement("div");
      div.appendChild(label);
      groupMembersDiv.appendChild(div);
    });
    groupNameInput.value = "";
    groupModal.style.display = "block";
  });
  closeGroupModalBtn.addEventListener("click", function() {
    groupModal.style.display = "none";
  });
  // グループ作成処理
  createGroupBtn.addEventListener("click", async function() {
    const groupName = groupNameInput.value.trim();
    if(groupName === "") {
      alert("グループ名を入力してください");
      return;
    }
    const checkboxes = groupMembersDiv.querySelectorAll("input[type=checkbox]:checked");
    let members = Array.from(checkboxes).map(cb => cb.value);
    // 自分も必ずメンバーに含める
    if(!members.includes(currentUser.username)) {
      members.push(currentUser.username);
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
        alert("グループ作成成功: " + data.group.groupName);
        groups.push(data.group);
        renderGroups();
        groupModal.style.display = "none";
      }
    } catch(err) {
      console.error(err);
    }
  });

  /* ----- グループ一覧レンダリング ----- */
  function renderGroups() {
    groupListUl.innerHTML = "";
    groups.forEach(group => {
      const li = document.createElement("li");
      li.textContent = group.groupName;
      li.className = "contact-item";
      li.addEventListener("click", function() {
        openChat("group", group.groupId, group.groupName);
      });
      groupListUl.appendChild(li);
    });
  }
  async function loadGroups() {
    // ※ 簡易実装：グループ情報はクライアント側にのみ保持（必要に応じてサーバー側保存も可能）
    // ここでは、既に作成されたグループは groups 配列にあるものとする
    renderGroups();
  }

  /* ----- チャット画面を開く（private/group） ----- */
  function openChat(type, id, displayName) {
    currentChat.type = type;
    currentChat.id = id;
    currentChat.name = displayName;
    messageHistory.innerHTML = "";
    if(type === "private") {
      // プライベートチャット履歴取得
      fetch(`/server/chatHistory?user1=${currentUser.username}&user2=${id}`)
      .then(res => res.json())
      .then(data => renderChatHistory(data.chatHistory))
      .catch(err => console.error(err));
    } else if(type === "group") {
      // グループチャット履歴取得
      fetch(`/server/groupChatHistory?groupId=${id}`)
      .then(res => res.json())
      .then(data => renderChatHistory(data.chatHistory))
      .catch(err => console.error(err));
      // 参加していなければグループルームに参加
      socket.emit('joinGroup', id);
    }
    showPage(pageChat);
  }
  function renderChatHistory(history) {
    if(history && history.length > 0) {
      history.forEach(msgObj => {
        appendMessage(msgObj.from, msgObj.message, msgObj.timestamp);
      });
    } else {
      const welcome = document.createElement("div");
      welcome.textContent = "チャット開始: " + currentChat.name;
      messageHistory.appendChild(welcome);
    }
    messageHistory.scrollTop = messageHistory.scrollHeight;
  }

  /* ----- メッセージ送信 ----- */
  sendMessageBtn.addEventListener("click", function() {
    const msg = chatInput.value.trim();
    if(msg === "" || !currentChat.id) return;
    const timestamp = new Date().toISOString();
    appendMessage(currentUser.username, msg, timestamp);
    if(currentChat.type === "private") {
      socket.emit('private message', { to: currentChat.id, message: msg, timestamp });
    } else if(currentChat.type === "group") {
      socket.emit('group message', { groupId: currentChat.id, message: msg });
    }
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
  });

  /* ----- メッセージ表示（送信者によって左右・日時表示） ----- */
  function appendMessage(sender, message, timestamp) {
    const div = document.createElement("div");
    div.classList.add("message");
    // 自分の送信メッセージは右寄せ
    if(sender === currentUser.username) {
      div.classList.add("message-right");
    } else {
      div.classList.add("message-left");
    }
    // 表示内容に送信者名（グループの場合は必ず表示）、本文、日時を追加
    let senderText = (currentChat.type === "group" && sender !== currentUser.username) ? sender + ": " : "";
    div.innerHTML = `<span>${senderText}${message}</span><span class="timestamp">${formatTimestamp(timestamp)}</span>`;
    messageHistory.appendChild(div);
  }
  function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  /* ----- 戻るボタン ----- */
  backToHomeBtn.addEventListener("click", function() {
    showPage(pageHome);
  });

  /* ----- Socket.IO イベント ----- */
  // 受信したプライベートメッセージ
  socket.on('private message', (data) => {
    if(currentChat.type === "private" && data.from === currentChat.id) {
      appendMessage(data.from, data.message, data.timestamp || new Date().toISOString());
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  });
  // 受信したグループメッセージ
  socket.on('group message', (data) => {
    if(currentChat.type === "group" && data.groupId === currentChat.id) {
      appendMessage(data.from, data.message, data.timestamp || new Date().toISOString());
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  });
});

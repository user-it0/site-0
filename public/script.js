document.addEventListener("DOMContentLoaded", function() {
  // Socket.IO 初期化（サーバーURLに合わせて変更）
  const socket = io();

  // グローバル変数
  let currentUser = null;
  let currentChatTarget = null; // 個別チャットの場合は文字列（友達名）、グループの場合はオブジェクト（{groupId, groupName, members}）
  let approvedFriends = [];
  let groupsList = [];

  // DOM要素取得
  const pageAuth = document.getElementById("page-auth");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const loginDiv = document.getElementById("login-form");
  const registrationDiv = document.getElementById("registration-form");
  const btnToRegistration = document.getElementById("to-registration");
  const btnToLogin = document.getElementById("to-login");

  const pageHome = document.getElementById("page-home");
  const displayUsername = document.getElementById("display-username");
  const userSearchInput = document.getElementById("user-search");
  const searchResultUl = document.getElementById("search-result");
  const friendRequestsUl = document.getElementById("friend-requests");
  const contactListUl = document.getElementById("contact-list");
  const btnCreateGroup = document.getElementById("create-group-btn");

  const pageChat = document.getElementById("page-chat");
  const backToHomeBtn = document.getElementById("back-to-home");
  const messageHistory = document.getElementById("message-history");
  const chatInput = document.getElementById("chat-input");
  const sendMessageBtn = document.getElementById("send-message");

  // グループ作成モーダル要素
  const groupModal = document.getElementById("group-modal");
  const closeGroupModal = document.getElementById("close-group-modal");
  const groupNameInput = document.getElementById("group-name");
  const groupMembersListDiv = document.getElementById("group-members-list");
  const btnCreateGroupConfirm = document.getElementById("create-group-confirm");

  /* ページ表示のフェード処理 */
  function showPage(page) {
    // すべてのページを非表示クラスに
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('visible');
      p.classList.add('hidden');
    });
    page.classList.remove('hidden');
    page.classList.add('visible');
  }

  // フォーム切替
  btnToRegistration.addEventListener("click", () => {
    loginDiv.style.display = "none";
    registrationDiv.style.display = "block";
  });
  btnToLogin.addEventListener("click", () => {
    registrationDiv.style.display = "none";
    loginDiv.style.display = "block";
  });

  // 新規ユーザー登録
  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("登録成功: " + currentUser.username);
        enterHome();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // ログイン処理
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        currentUser = data.user;
        alert("ログイン成功: " + currentUser.username);
        enterHome();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // ホーム画面に入る
  function enterHome() {
    displayUsername.value = currentUser.username;
    socket.emit('join', currentUser.username);
    loadApprovedFriends();
    loadFriendRequests();
    showPage(pageHome);
  }

  // 承認済み友達一覧取得
  async function loadApprovedFriends() {
    try {
      const res = await fetch(`/approvedFriends?username=${currentUser.username}`);
      const data = await res.json();
      approvedFriends = data.approvedFriends;
      renderContactList();
    } catch (err) {
      console.error(err);
    }
  }

  // 友達リクエスト一覧取得
  async function loadFriendRequests() {
    try {
      const res = await fetch(`/friendRequests?username=${currentUser.username}`);
      const data = await res.json();
      renderFriendRequests(data.friendRequests);
    } catch (err) {
      console.error(err);
    }
  }

  // 友達リクエストリストレンダリング
  function renderFriendRequests(requests) {
    friendRequestsUl.innerHTML = "";
    requests.forEach(requester => {
      const li = document.createElement("li");
      li.className = "contact-item";
      li.textContent = requester;
      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "承認";
      acceptBtn.addEventListener("click", () => respondFriendRequest(requester, 'accept'));
      const declineBtn = document.createElement("button");
      declineBtn.textContent = "拒否";
      declineBtn.addEventListener("click", () => respondFriendRequest(requester, 'decline'));
      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
      friendRequestsUl.appendChild(li);
    });
  }

  // 友達リクエストへの応答
  async function respondFriendRequest(from, response) {
    try {
      const res = await fetch('/respondFriendRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, from, response })
      });
      const data = await res.json();
      alert(data.message);
      loadFriendRequests();
      loadApprovedFriends();
    } catch (err) {
      console.error(err);
    }
  }

  // ユーザー検索
  userSearchInput.addEventListener("input", async function() {
    const query = this.value.trim().toLowerCase();
    searchResultUl.innerHTML = "";
    if (query === "") return;
    try {
      const res = await fetch(`/users?username=${currentUser.username}`);
      const data = await res.json();
      const results = data.users.filter(u => u.toLowerCase().includes(query));
      results.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user;
        li.className = "contact-item";
        li.addEventListener("click", async () => {
          // 友達追加リクエスト送信
          try {
            const res = await fetch('/sendFriendRequest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: currentUser.username, to: user })
            });
            const resultData = await res.json();
            alert(resultData.message || resultData.error);
          } catch (err) {
            console.error(err);
          }
        });
        searchResultUl.appendChild(li);
      });
    } catch (err) {
      console.error(err);
    }
  });

  // リアルタイムで友達追加リクエストを受信
  socket.on('newFriendRequest', (data) => {
    // data: { from }
    const li = document.createElement("li");
    li.className = "contact-item";
    li.textContent = data.from;
    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "承認";
    acceptBtn.addEventListener("click", () => respondFriendRequest(data.from, 'accept'));
    const declineBtn = document.createElement("button");
    declineBtn.textContent = "拒否";
    declineBtn.addEventListener("click", () => respondFriendRequest(data.from, 'decline'));
    li.appendChild(acceptBtn);
    li.appendChild(declineBtn);
    friendRequestsUl.appendChild(li);
  });

  // 連絡可能ユーザー＆グループリストレンダリング
  function renderContactList() {
    contactListUl.innerHTML = "";
    // 個別チャット（友達）
    approvedFriends.forEach(friend => {
      const li = document.createElement("li");
      li.className = "contact-item";
      li.textContent = friend;
      li.addEventListener("click", () => openChat(friend));
      contactListUl.appendChild(li);
    });
    // グループチャット
    groupsList.forEach(group => {
      const li = document.createElement("li");
      li.className = "contact-item";
      li.textContent = "グループ: " + group.groupName;
      li.addEventListener("click", () => openGroupChat(group));
      contactListUl.appendChild(li);
    });
  }

  // グループ作成ボタン
  btnCreateGroup.addEventListener("click", () => {
    // モーダル表示
    showGroupModal();
  });

  // グループ作成モーダル表示処理
  function showGroupModal() {
    // モーダル内に、承認済み友達のリスト（チェックボックス）を表示
    groupMembersListDiv.innerHTML = "";
    approvedFriends.forEach(friend => {
      const label = document.createElement("label");
      label.style.display = "block";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = friend;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + friend));
      groupMembersListDiv.appendChild(label);
    });
    groupNameInput.value = "";
    groupModal.style.display = "block";
  }

  // モーダル閉じる処理
  closeGroupModal.addEventListener("click", () => {
    groupModal.style.display = "none";
  });

  // グループ作成確定処理
  btnCreateGroupConfirm.addEventListener("click", async () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
      alert("グループ名を入力してください");
      return;
    }
    // 選択されたメンバー取得
    const checkboxes = groupMembersListDiv.querySelectorAll("input[type='checkbox']");
    let members = [];
    checkboxes.forEach(cb => {
      if (cb.checked) members.push(cb.value);
    });
    // 自分もメンバーに含める
    if (!members.includes(currentUser.username)) {
      members.push(currentUser.username);
    }
    try {
      const res = await fetch('/createGroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, members })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(data.message);
        groupsList.push(data.group);
        renderContactList();
        groupModal.style.display = "none";
      }
    } catch (err) {
      console.error(err);
    }
  });

  // チャット画面を開く（個別チャット）
  function openChat(friend) {
    currentChatTarget = friend;
    messageHistory.innerHTML = "";
    // 取得：個別チャット履歴
    fetch(`/chatHistory?user1=${currentUser.username}&user2=${friend}`)
      .then(res => res.json())
      .then(data => {
        if (data.chatHistory && data.chatHistory.length > 0) {
          data.chatHistory.forEach(msgObj => {
            appendMessage(msgObj, msgObj.from === currentUser.username, msgObj.timestamp);
          });
        } else {
          appendSystemMessage("チャット開始: " + friend);
        }
        messageHistory.scrollTop = messageHistory.scrollHeight;
      })
      .catch(err => {
        console.error(err);
        appendSystemMessage("チャット開始: " + friend);
      });
    showPage(pageChat);
  }

  // グループチャットを開く
  function openGroupChat(group) {
    currentChatTarget = group; // オブジェクトとして保持
    messageHistory.innerHTML = "";
    // 取得：グループチャット履歴（キーはgroupId）
    fetch(`/chatHistory?user1=${group.groupId}&user2=${group.groupId}`)
      .then(res => res.json())
      .then(data => {
        if (data.chatHistory && data.chatHistory.length > 0) {
          data.chatHistory.forEach(msgObj => {
            appendMessage(msgObj, msgObj.from === currentUser.username, msgObj.timestamp);
          });
        } else {
          appendSystemMessage("グループチャット開始: " + group.groupName);
        }
        messageHistory.scrollTop = messageHistory.scrollHeight;
      })
      .catch(err => {
        console.error(err);
        appendSystemMessage("グループチャット開始: " + group.groupName);
      });
    // ルーム参加：グループIDでSocket.IOのルームに入る
    socket.emit('join', group.groupId);
    showPage(pageChat);
  }

  // メッセージ要素生成（メッセージバブル＋タイムスタンプ）
  function appendMessage(msgObj, isSent, timestamp) {
    const div = document.createElement("div");
    div.className = "message " + (isSent ? "message-sent" : "message-received");
    div.innerHTML = msgObj.message + `<span class="timestamp">${formatTimestamp(timestamp)}</span>`;
    messageHistory.appendChild(div);
  }

  // システムメッセージ（例：チャット開始）表示
  function appendSystemMessage(text) {
    const div = document.createElement("div");
    div.style.textAlign = "center";
    div.style.color = "#888";
    div.textContent = text;
    messageHistory.appendChild(div);
  }

  // タイムスタンプ整形（例：HH:MM, 日付）
  function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  // 送信ボタン処理（個別 or グループ判別）
  sendMessageBtn.addEventListener("click", () => {
    const msg = chatInput.value.trim();
    if (!msg || !currentChatTarget) return;
    const timestamp = new Date().toISOString();
    // 自分のメッセージを表示（右側）
    appendMessage({ message: msg }, true, timestamp);
    chatInput.value = "";
    messageHistory.scrollTop = messageHistory.scrollHeight;
    // 送信先が個別チャット（文字列）かグループ（オブジェクトかどうか）で分岐
    if (typeof currentChatTarget === "string") {
      socket.emit('private message', { to: currentChatTarget, message: msg });
    } else if (currentChatTarget.groupId) {
      socket.emit('group message', { groupId: currentChatTarget.groupId, message: msg });
    }
  });

  // 戻るボタン処理
  backToHomeBtn.addEventListener("click", () => {
    showPage(pageHome);
  });

  // 受信メッセージ（個別チャット）
  socket.on('private message', (data) => {
    if (currentChatTarget === data.from || currentChatTarget === data.to) {
      appendMessage(data, false, data.timestamp);
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  });

  // 受信メッセージ（グループチャット）
  socket.on('group message', (data) => {
    // 受信したグループメッセージは、開いているチャットが該当グループの場合のみ表示
    if (currentChatTarget && currentChatTarget.groupId === data.groupId) {
      appendMessage(data, data.from === currentUser.username, data.timestamp);
      messageHistory.scrollTop = messageHistory.scrollHeight;
    }
  });
});

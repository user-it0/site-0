document.addEventListener("DOMContentLoaded", function() {
    // Socket.IO 初期化（必要に応じてサーバーURLを調整）
    const socket = io();
  
    // グローバル変数
    let currentUser = null;
    let currentChatFriend = null; // 個別の場合は相手のユーザー名、グループの場合はグループID
    let isGroupChat = false;      // グループチャットかどうかのフラグ
  
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
  
    // グループ作成モーダル関連
    const createGroupBtn = document.getElementById("create-group-btn");
    const groupModal = document.getElementById("group-modal");
    const closeGroupModal = document.getElementById("close-group-modal");
    const groupNameInput = document.getElementById("group-name");
    const groupMembersList = document.getElementById("group-members-list");
    const createGroupConfirmBtn = document.getElementById("create-group-confirm");
  
    // フェードアウト・フェードインの簡易関数
    function fadeOut(element, callback) {
      element.style.opacity = 0;
      setTimeout(callback, 500);
    }
    function fadeIn(element) {
      element.style.opacity = 1;
    }
  
    // フォーム切替
    toRegistrationBtn.addEventListener("click", function() {
      fadeOut(loginDiv, () => {
        loginDiv.style.display = "none";
        registrationDiv.style.display = "block";
        fadeIn(registrationDiv);
      });
    });
    toLoginBtn.addEventListener("click", function() {
      fadeOut(registrationDiv, () => {
        registrationDiv.style.display = "none";
        loginDiv.style.display = "block";
        fadeIn(loginDiv);
      });
    });
  
    // 新規ユーザー登録
    registrationForm.addEventListener("submit", async function(e) {
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
        const res = await fetch('/login', {
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
  
    // ホーム画面表示
    function showHomePage() {
      displayUsername.value = currentUser.username;
      fadeOut(pageAuth, () => {
        pageAuth.style.display = "none";
        pageHome.style.display = "block";
        fadeIn(pageHome);
        socket.emit('join', currentUser.username);
        loadApprovedFriends();
        loadFriendRequests();
      });
    }
  
    // 承認済み友達一覧の取得とレンダリング
    async function loadApprovedFriends() {
      try {
        const res = await fetch(`/approvedFriends?username=${currentUser.username}`);
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
  
    // 友達リクエストの取得とレンダリング
    async function loadFriendRequests() {
      try {
        const res = await fetch(`/friendRequests?username=${currentUser.username}`);
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
      } catch(err) {
        console.error(err);
      }
    }
  
    // リアルタイムの友達リクエスト受信
    socket.on('new friend request', (data) => {
      const li = document.createElement("li");
      li.textContent = data.from;
      li.className = "contact-item";
      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "承認";
      acceptBtn.addEventListener("click", function() {
        respondFriendRequest(data.from, 'accept');
      });
      const declineBtn = document.createElement("button");
      declineBtn.textContent = "拒否";
      declineBtn.addEventListener("click", function() {
        respondFriendRequest(data.from, 'decline');
      });
      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
      friendRequestsUl.appendChild(li);
    });
  
    // ユーザー検索機能
    userSearchInput.addEventListener("input", async function() {
      const query = this.value.trim().toLowerCase();
      searchResultUl.innerHTML = "";
      if(query === "") return;
      try {
        const res = await fetch(`/users?username=${currentUser.username}`);
        const data = await res.json();
        const results = data.users.filter(u => u.toLowerCase().includes(query));
        results.forEach(user => {
          const li = document.createElement("li");
          li.textContent = user;
          li.className = "contact-item";
          li.addEventListener("click", async function() {
            try {
              const res = await fetch('/sendFriendRequest', {
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
  
    // グループ作成モーダルの表示・閉じる
    createGroupBtn.addEventListener("click", function() {
      groupMembersList.innerHTML = "";
      Array.from(contactListUl.children).forEach(li => {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = li.textContent;
        const label = document.createElement("label");
        label.textContent = li.textContent;
        const container = document.createElement("div");
        container.appendChild(checkbox);
        container.appendChild(label);
        groupMembersList.appendChild(container);
      });
      groupModal.style.display = "block";
    });
    closeGroupModal.addEventListener("click", function() {
      groupModal.style.display = "none";
    });
    createGroupConfirmBtn.addEventListener("click", function() {
      const groupName = groupNameInput.value.trim();
      if(groupName === "") {
        alert("グループ名を入力してください");
        return;
      }
      const checkboxes = groupMembersList.querySelectorAll("input[type=checkbox]");
      let selectedMembers = [];
      checkboxes.forEach(cb => {
        if(cb.checked) selectedMembers.push(cb.value);
      });
      if(selectedMembers.length === 0) {
        alert("少なくとも1人のメンバーを選択してください");
        return;
      }
      socket.emit('create group', { groupName, members: selectedMembers });
      groupModal.style.display = "none";
    });
  
    // グループ作成完了のリアルタイム通知
    socket.on('group created', (data) => {
      const li = document.createElement("li");
      li.textContent = data.groupName + " (" + data.members.join(", ") + ")";
      li.className = "contact-item";
      li.addEventListener("click", function() {
        openChat(data.groupId, true, data.groupName);
      });
      groupListUl.appendChild(li);
    });
  
    // チャット画面を開く（個別・グループの切替）
    function openChat(chatId, isGroup, groupName = "") {
      currentChatFriend = chatId;
      isGroupChat = isGroup;
      fadeOut(pageHome, () => {
        pageHome.style.display = "none";
        pageChat.style.display = "block";
        fadeIn(pageChat);
        messageHistory.innerHTML = "";
        if(isGroupChat) {
          fetch(`/groupChatHistory?groupId=${chatId}`)
            .then(res => res.json())
            .then(data => {
               if(data.chatHistory && data.chatHistory.length > 0) {
                   data.chatHistory.forEach(msgObj => {
                       appendMessage(msgObj, true);
                   });
               } else {
                   const welcome = document.createElement("div");
                   welcome.textContent = groupName + " チャットを開始します";
                   messageHistory.appendChild(welcome);
               }
               messageHistory.scrollTop = messageHistory.scrollHeight;
            })
            .catch(err => { console.error(err); });
        } else {
          fetch(`/chatHistory?user1=${currentUser.username}&user2=${chatId}`)
            .then(res => res.json())
            .then(data => {
               if(data.chatHistory && data.chatHistory.length > 0) {
                   data.chatHistory.forEach(msgObj => {
                       appendMessage(msgObj, false);
                   });
               } else {
                   const welcome = document.createElement("div");
                   welcome.textContent = "チャット開始: " + chatId;
                   messageHistory.appendChild(welcome);
               }
               messageHistory.scrollTop = messageHistory.scrollHeight;
            })
            .catch(err => { console.error(err); });
        }
      });
    }
  
    // メッセージの追加（左右配置＋送信時刻表示）
    function appendMessage(msgObj, isGroup) {
      const div = document.createElement("div");
      const timeSpan = document.createElement("span");
      timeSpan.className = "timestamp";
      timeSpan.textContent = new Date(msgObj.timestamp).toLocaleString();
      if(msgObj.from === currentUser.username) {
        div.className = "message-self";
        div.textContent = "【自分】 " + msgObj.message;
      } else {
        div.className = "message-other";
        div.textContent = `【${msgObj.from}】 ${msgObj.message}`;
      }
      div.appendChild(timeSpan);
      messageHistory.appendChild(div);
    }
  
    // ホーム画面へ戻る
    backToHomeBtn.addEventListener("click", function() {
      fadeOut(pageChat, () => {
        pageChat.style.display = "none";
        pageHome.style.display = "block";
        fadeIn(pageHome);
      });
    });
  
    // チャットメッセージ送信
    sendMessageBtn.addEventListener("click", function() {
      const msg = chatInput.value.trim();
      if(msg === "" || !currentChatFriend) return;
      if(isGroupChat) {
        socket.emit('group message', { groupId: currentChatFriend, message: msg });
        appendMessage({ from: currentUser.username, message: msg, timestamp: new Date().toISOString() }, true);
      } else {
        socket.emit('private message', { to: currentChatFriend, message: msg });
        appendMessage({ from: currentUser.username, message: msg, timestamp: new Date().toISOString() }, false);
      }
      chatInput.value = "";
      messageHistory.scrollTop = messageHistory.scrollHeight;
    });
  
    // 受信した個別メッセージの表示
    socket.on('private message', (data) => {
      if(data.from === currentChatFriend) {
        appendMessage(data, false);
        messageHistory.scrollTop = messageHistory.scrollHeight;
      }
    });
  
    // 受信したグループメッセージの表示
    socket.on('group message', (data) => {
      if(isGroupChat && data.groupId === currentChatFriend) {
        appendMessage(data, true);
        messageHistory.scrollTop = messageHistory.scrollHeight;
      }
    });
  });
  
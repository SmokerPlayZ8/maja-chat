import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, setDoc, addDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { deriveChatKey, encryptMessage, decryptMessage, randomToken, makeSalt, toBase64 } from "./crypto";
import { LockKeyhole, Heart, Send, LogOut, Plus, KeyRound, ShieldCheck, Eye, EyeOff, MessageCircle, Copy, Check, Sparkles } from "lucide-react";

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [roomId, setRoomId] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [room, setRoom] = useState(null);
  const [key, setKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const processed = useRef(new Set());

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!room || !key || !user) return;
    processed.current = new Set();
    const q = query(collection(db, "rooms", room.id, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          setMessages((old) => old.filter((m) => m.id !== change.doc.id));
          continue;
        }
        if (change.type !== "added") continue;
        const data = change.doc.data();
        const id = change.doc.id;
        if (processed.current.has(id)) continue;
        processed.current.add(id);
        try {
          const body = await decryptMessage(data.ciphertext, data.iv, key);
          const item = { id, ...data, body };
          setMessages((old) => old.some((m) => m.id === id) ? old : [...old, item].sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
          // The recipient's browser decrypts and renders the message before deleting it from Firestore.
          if (data.recipientEmail === user.email.toLowerCase()) {
            window.setTimeout(() => deleteDoc(doc(db, "rooms", room.id, "messages", id)).catch(() => {}), 900);
          }
        } catch (e) {
          setError("Couldn't decrypt this message. Check that both of you entered the same secret phrase.");
          processed.current.delete(id);
        }
      }
    }, (e) => setError("Live connection error: " + e.message));
    return () => unsub();
  }, [room, key, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function authenticate(e) {
    e.preventDefault(); setAuthError(""); setBusy(true);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      }
    } catch (e) { setAuthError(authMessage(e.code)); }
    finally { setBusy(false); }
  }

  async function createRoom(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const partner = partnerEmail.trim().toLowerCase();
      if (!partner || partner === user.email.toLowerCase()) throw new Error("Enter your partner's different email address.");
      const id = randomToken(18);
      const secret = randomToken(32);
      const salt = toBase64(makeSalt());
      await setDoc(doc(db, "rooms", id), {
        ownerEmail: user.email.toLowerCase(), partnerEmail: partner, salt,
        createdAt: serverTimestamp(), protocol: "AES-GCM-256/PBKDF2-SHA256"
      });
      const newRoom = { id, ownerEmail: user.email.toLowerCase(), partnerEmail: partner, salt };
      const newKey = await deriveChatKey(secret, salt);
      setPendingRoom(newRoom); setPendingKey(newKey);
      setRoomId(id); setPassphrase(secret);
      setCreatedInvite({ id, secret, partner });
    } catch (e) { setError(e.message || "Couldn't create your private room."); }
    finally { setBusy(false); }
  }

  async function joinRoom(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const id = roomId.trim();
      const snap = await getDoc(doc(db, "rooms", id));
      if (!snap.exists()) throw new Error("Room not found. Check the room ID.");
      const data = snap.data();
      const current = user.email.toLowerCase();
      if (current !== data.ownerEmail && current !== data.partnerEmail) {
        throw new Error("This room is locked to the two email addresses invited by its creator.");
      }
      if (!passphrase.trim()) throw new Error("Enter the shared secret phrase.");
      const derived = await deriveChatKey(passphrase.trim(), data.salt);
      setRoom({ id, ...data }); setKey(derived); setCreatedInvite(null);
    } catch (e) {
      setError(e.code === "permission-denied" ? "This room is private. Sign in with the invited email address." : (e.message || "Couldn't join room."));
    } finally { setBusy(false); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !room || !key || busy) return;
    setBusy(true); setError("");
    try {
      const recipient = user.email.toLowerCase() === room.ownerEmail ? room.partnerEmail : room.ownerEmail;
      const encrypted = await encryptMessage(text, key);
      await addDoc(collection(db, "rooms", room.id, "messages"), {
        ...encrypted, senderUid: user.uid, senderEmail: user.email.toLowerCase(),
        recipientEmail: recipient, createdAt: serverTimestamp()
      });
      setDraft("");
    } catch (e) { setError("Message wasn't sent: " + e.message); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    const text = `Room ID: ${createdInvite.id}\nSecret phrase: ${createdInvite.secret}\nSign in using: ${createdInvite.partner}`;
    await navigator.clipboard.writeText(text);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  function leaveRoom() {
    setRoom(null); setKey(null); setMessages([]); setCreatedInvite(null);
    setPendingRoom(null); setPendingKey(null);
    setRoomId(""); setPassphrase(""); setError("");
  }

  async function logout() {
    leaveRoom(); await signOut(auth);
  }

  if (!user) return (
    <main className="auth-shell">
      <div className="glow glow-one" /><div className="glow glow-two" />
      <section className="auth-card">
        <div className="brand-mark"><Heart size={22} fill="currentColor" /></div>
        <div className="eyebrow">A LITTLE SPACE FOR TWO</div>
        <h1>Afterglow<span>.</span></h1>
        <p className="subhead">Private conversations. Nothing left behind.</p>
        <div className="secure-note"><LockKeyhole size={15}/> End-to-end encrypted by your devices</div>
        <form onSubmit={authenticate} className="stack">
          {authMode === "signup" && <label>Your name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="What should we call you?" autoComplete="nickname"/></label>}
          <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label>
          <label>Password<input type="password" required minLength="8" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode==="signup"?"new-password":"current-password"}/></label>
          {authError && <div className="error">{authError}</div>}
          <button className="primary" disabled={busy}>{busy ? "Please wait…" : authMode==="signup" ? "Create my account" : "Sign in"} <span>→</span></button>
        </form>
        <p className="switch-auth">{authMode==="signup"?"Already have an account?":"New here?"} <button onClick={()=>{setAuthMode(authMode==="signup"?"login":"signup");setAuthError("");}}>{authMode==="signup"?"Sign in":"Create account"}</button></p>
        <p className="fineprint">Use separate accounts for the two of you. Your password is managed by Firebase Authentication.</p>
      </section>
    </main>
  );

  if (!room || !key) return (
    <main className="setup-shell">
      <header className="topbar"><div className="brand"><span className="brand-dot"><Heart size={15} fill="currentColor"/></span> afterglow</div><button className="ghost" onClick={logout}><LogOut size={16}/> Sign out</button></header>
      <section className="welcome">
        <div className="welcome-icon"><MessageCircle size={26}/></div>
        <div className="eyebrow">JUST THE TWO OF YOU</div>
        <h1>Your own little<br/><em>corner of the internet.</em></h1>
        <p className="subhead">Create a private room or join the one your person made.</p>
      </section>
      <div className="setup-grid">
        <form className="panel" onSubmit={createRoom}>
          <div className="panel-icon"><Plus size={19}/></div><h2>Create your room</h2>
          <p>Invite your partner using the email address they'll use to sign in.</p>
          <label>Partner's email<input type="email" required value={partnerEmail} onChange={e=>setPartnerEmail(e.target.value)} placeholder="their@email.com"/></label>
          <button className="primary" disabled={busy}>Create private room <span>→</span></button>
        </form>
        <form className="panel" onSubmit={joinRoom}>
          <div className="panel-icon"><KeyRound size={19}/></div><h2>Join a room</h2>
          <p>Enter the room details your partner shared with you.</p>
          <label>Room ID<input required value={roomId} onChange={e=>setRoomId(e.target.value)} placeholder="Paste room ID"/></label>
          <label>Secret phrase<div className="password-wrap"><input required type={showPass?"text":"password"} value={passphrase} onChange={e=>setPassphrase(e.target.value)} placeholder="Paste secret phrase"/><button type="button" className="eye" onClick={()=>setShowPass(!showPass)}>{showPass?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
          <button className="secondary" disabled={busy}>Unlock our chat <span>→</span></button>
        </form>
      </div>
      {createdInvite && <section className="invite-card">
        <div className="invite-heading"><div><div className="eyebrow">ROOM CREATED</div><h2>Send this to your person.</h2></div><div className="invite-heart"><Heart size={18} fill="currentColor"/></div></div>
        <p>They must sign in with <b>{createdInvite.partner}</b>, then enter these details.</p>
        <div className="invite-code"><span>ROOM ID</span><code>{createdInvite.id}</code></div>
        <div className="invite-code"><span>SECRET PHRASE</span><code>{createdInvite.secret}</code></div>
        <button className="primary copy-button" onClick={copyInvite}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied":"Copy invite details"}</button>
        <button className="secondary copy-button" onClick={()=>{setRoom(pendingRoom);setKey(pendingKey);setCreatedInvite(null);}}>Open our chat <span>→</span></button>
        <p className="warning">Keep the secret phrase private. Share it only with your partner through a trusted channel. It cannot be recovered if lost.</p>
      </section>}
      {error && <div className="error setup-error">{error}</div>}
      <div className="security-foot"><ShieldCheck size={16}/> Messages are encrypted on your devices before they reach the database.</div>
    </main>
  );

  const partner = user.email.toLowerCase() === room.ownerEmail ? room.partnerEmail : room.ownerEmail;
  return (
    <main className="chat-shell">
      <header className="chat-topbar">
        <div className="brand"><span className="brand-dot"><Heart size={15} fill="currentColor"/></span> afterglow</div>
        <div className="chat-person"><div className="avatar">{partner.slice(0,1).toUpperCase()}</div><div><b>{partner}</b><small><span className="online-dot"/> your private room</small></div></div>
        <div className="top-actions"><span className="encrypted-label"><LockKeyhole size={13}/> E2E ENCRYPTED</span><button className="ghost" onClick={leaveRoom}>Leave room</button><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={17}/></button></div>
      </header>
      <section className="chat-area">
        <div className="chat-intro"><div className="intro-heart"><Heart size={19} fill="currentColor"/></div><h2>Just you two.</h2><p>Messages disappear after the other person opens them.</p><div className="encryption-pill"><LockKeyhole size={13}/> Encrypted on this device</div></div>
        <div className="messages">
          {messages.length===0 && <div className="empty-state"><Sparkles size={21}/><p>It's quiet here. Send the first little hello.</p></div>}
          {messages.map((m)=> {
            const mine = m.senderUid === user.uid;
            return <div className={`message-row ${mine?"mine":"theirs"}`} key={m.id}>
              <div className="bubble"><p>{m.body}</p><div className="bubble-meta">{mine?"You":partner} <span>·</span> {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "now"} {!mine && <span className="vanish">· disappearing</span>}</div></div>
            </div>;
          })}
          <div ref={bottomRef}/>
        </div>
        {error && <div className="error chat-error">{error}</div>}
        <form className="composer" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write something only they will see…" maxLength="4000"/><button className="send-button" disabled={!draft.trim()||busy} aria-label="Send message"><Send size={18}/></button></form>
        <p className="composer-note"><LockKeyhole size={12}/> Once opened by the recipient, a message is deleted from the server.</p>
      </section>
    </main>
  );
}

function authMessage(code) {
  const messages = {
    "auth/email-already-in-use":"That email already has an account. Try signing in.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Choose a stronger password (at least 8 characters).",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/too-many-requests":"Too many attempts. Please wait and try again."
  };
  return messages[code] || "Authentication failed. Please try again.";
}

// src/sandbox/HelloApp.tsx
export default function HelloApp() {
  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#e0f2fe'}}>
      <div style={{background:'#fff',borderRadius:16,padding:16,boxShadow:'0 10px 30px rgba(0,0,0,.15)'}}>
        <b>HelloApp React OK ✅</b>
        <div style={{marginTop:8}}>Si ceci s’affiche avec <code>?hello=1</code>, le problème vient de <code>App.tsx</code> ou d’un de ses imports.</div>
      </div>
    </div>
  )
}

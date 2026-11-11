import React from 'react';
export default class ErrorBoundary extends React.Component<React.PropsWithChildren,{error:string|null}>{
 state={error:null as string|null};
 static getDerivedStateFromError(error:Error){return {error:error.message||'Unexpected display error'}}
 render(){if(!this.state.error)return this.props.children;return <main className="account-login"><section className="panel"><h1>The screen could not be displayed</h1><p>A display error occurred. This does not confirm whether a controller request completed. Do not start another sync until its saved status is checked.</p><pre style={{whiteSpace:'pre-wrap'}}>{this.state.error}</pre><a className="download-link" href="/api/rolling" target="_blank" rel="noreferrer">Open saved sync status</a><p>Save this error message for troubleshooting.</p><button className="outline" onClick={()=>location.reload()}>Reload application</button></section></main>}
}

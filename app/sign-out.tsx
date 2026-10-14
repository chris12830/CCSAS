'use client';
import {useState} from 'react';
export default function SignOut(){const [error,setError]=useState('');return <div style={{textAlign:'right',padding:'8px 20px'}}><button onClick={async()=>{const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'logout'})});if(response.ok)window.location.assign('/login');else setError('Sign out failed. Please retry.');}}>Sign out</button>{error&&<span role='alert'>{error}</span>}</div>;}

import {getDatabase} from '../lib/vps-database.mjs';
import {passwordHash,normalizeEmail,inviteSupplier} from '../lib/vps-auth.mjs';
import {randomUUID} from 'node:crypto';
const db=getDatabase();try{
 const command=process.argv[2];
 if(command==='migrate'){db.migrate(new URL('../drizzle',import.meta.url));console.log('Database migrations applied.');}
 else if(command==='owner'){
  const email=normalizeEmail(process.argv[3]),name=process.argv[4]||'Network owner';let password='';for await(const chunk of process.stdin)password+=chunk;password=password.replace(/\r?\n$/,'');
  const hash=await passwordHash(password);if(db.raw.prepare("SELECT id FROM vps_users WHERE role='owner'").get())throw new Error('Owner already exists. Use reset-password for recovery.');
  db.raw.prepare('INSERT INTO vps_users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)').run(randomUUID(),email,name,hash,'owner');console.log('Owner created. Sign in to initialize the network.');
 }else if(command==='invite'){const token=inviteSupplier(db,process.argv[3]);if(!process.env.SAS_BASE_URL)throw new Error('Set SAS_BASE_URL');console.log(process.env.SAS_BASE_URL+'/register?token='+token);}
 else if(command==='reset-password'){
  const email=normalizeEmail(process.argv[3]);let password='';for await(const chunk of process.stdin)password+=chunk;const hash=await passwordHash(password.replace(/\r?\n$/,''));
  db.raw.exec('BEGIN IMMEDIATE');try{const user=db.raw.prepare('SELECT id FROM vps_users WHERE email=?').get(email);if(!user)throw new Error('Account not found');db.raw.prepare('UPDATE vps_users SET password_hash=? WHERE id=?').run(hash,user.id);db.raw.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);db.raw.exec('COMMIT');console.log('Password reset; previous sessions revoked.');}catch(e){db.raw.exec('ROLLBACK');throw e;}
 }else throw new Error('Use migrate, owner EMAIL NAME, invite EMAIL, or reset-password EMAIL. Passwords are read from stdin, never command arguments.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{db.close();}

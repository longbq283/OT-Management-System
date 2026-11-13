import {openDatabase} from './database.mjs';
export const DEVICE_STATE_KEY='device:shared';
export async function readDeviceState(){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('Metadata'),r=tx.objectStore('Metadata').get(DEVICE_STATE_KEY);tx.oncomplete=()=>resolve(r.result?.value||null);tx.onabort=()=>reject(tx.error);});}
// No credential is accepted here. Device state is excluded from exported/shared backups.
export async function writeDeviceState(value){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('Metadata','readwrite');tx.objectStore('Metadata').put({key:DEVICE_STATE_KEY,value});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}

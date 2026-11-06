import { Capacitor, registerPlugin } from '@capacitor/core';
import {spaceId} from '../src/space.mjs';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import {platformServices,readPickedPhoto} from './platform-services.mjs';

if (Capacitor.isNativePlatform()) {
  const owner=spaceId();
  const platform=Capacitor.getPlatform();
  document.documentElement.classList.add('native-app');
  document.documentElement.classList.add('native-'+platform);
  const blobBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  let exporting = false;
  // Only app-generated blobs can reach the native cache; filenames cannot contain paths.
  window.shiriNative = {
    platform,...platformServices(platform,registerPlugin,owner),
    readPickedPhoto:photo=>readPickedPhoto(photo,path=>Capacitor.convertFileSrc(path)),
    photoURL: path => Capacitor.convertFileSrc(path),
    async exportFile(blob, filename) {
      if (exporting) throw Error('正在准备上一个文件，请稍候。');
      if (!(blob instanceof Blob) || blob.size > 200 * 1024 * 1024) throw Error('导出文件超过 200 MB 限制。');
      if (!filename || /[\\/\x00-\x1f]/.test(filename) || filename.includes('..')) throw Error('导出文件名无效。');
      exporting = true;
      const path = `exports/${Date.now()}-${filename}`;
      try {
        await Filesystem.mkdir({path:'exports',directory:Directory.Cache,recursive:true}).catch(() => {});
        // Clean only this app's own previous export cache after a day, never user documents.
        const old = await Filesystem.readdir({path:'exports',directory:Directory.Cache});
        for (const file of old.files) {
          if (file.type === 'file' && /^\d{13}-/.test(file.name) && Date.now() - Number(file.name.slice(0,13)) > 86400000)
            await Filesystem.deleteFile({path:`exports/${file.name}`,directory:Directory.Cache}).catch(() => {});
        }
        await Filesystem.writeFile({path,directory:Directory.Cache,data:''});
        // Bound JS/native bridge allocations rather than converting the entire backup at once.
        for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
          await Filesystem.appendFile({path,directory:Directory.Cache,data:await blobBase64(blob.slice(offset,offset + 512 * 1024))});
        }
        const {uri} = await Filesystem.getUri({path,directory:Directory.Cache});
        await Share.share({title:filename,files:[uri],dialogTitle:'保存或分享拾日文件'});
      } catch (error) {
        throw Error(`导出未完成：${error?.message || '请重试，并选择可保存文件的应用。'}`);
      } finally { exporting = false; }
    },
  };
  App.addListener('appStateChange',state=>{if(state.isActive)document.dispatchEvent(new Event('shiri-native-resume'));});
  if(platform==='android')App.addListener('backButton', () => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { dialog.close(); return; }
    if (location.hash && location.hash !== '#dashboard') { location.hash = 'dashboard'; return; }
    App.minimizeApp();
  });
}

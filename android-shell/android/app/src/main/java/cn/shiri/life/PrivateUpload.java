package cn.shiri.life;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.WorkManager;

/** Compatibility shim for the retired 0.3 all-photo uploader.
 * Gallery collection and existing PhotoQueue rows are preserved.
 */
final class PrivateUpload {
    static final String JOB="shiri-private-upload", NOW="shiri-private-upload-now";
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("shiri-private-cloud",Context.MODE_PRIVATE);}
    static boolean enabled(Context c,String owner){return false;}
    static void configure(Context c,String owner,boolean enabled,String token){
        if(enabled)throw new SecurityException("旧版私人自动上传已停用；仅明确确认分享的照片允许上传");
        suspendAll(c);
    }
    static void suspendAll(Context c){
        prefs(c).edit().clear().commit();
        WorkManager.getInstance(c).cancelUniqueWork(JOB);
        WorkManager.getInstance(c).cancelUniqueWork(NOW);
    }
}

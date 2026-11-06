package cn.shiri.life;

import android.content.Context;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.annotation.NonNull;

public class PhotoWorker extends Worker {
    public PhotoWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    @NonNull public Result doWork(){
        try { PhotoCollector.collect(getApplicationContext(),getInputData().getBoolean("manual",false),()->isStopped());return Result.success(); }
        catch(Exception e){PhotoCollector.preferences(getApplicationContext()).edit().putString("lastStatus",e instanceof SecurityException?"相册权限已变化，请重新授权。":"自动采集未完成，原图未删除；请检查存储和权限后重试。").apply();return Result.success();}
    }
}

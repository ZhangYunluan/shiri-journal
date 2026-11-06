package cn.shiri.life;
import android.content.Context;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Retain this class so previously persisted WorkManager jobs resolve safely.
 * No network operation: unapproved photos must never upload, including after upgrade.
 */
public final class PhotoUploadWorker extends Worker {
    public PhotoUploadWorker(Context context,WorkerParameters parameters){super(context,parameters);}
    @Override public Result doWork(){return Result.success();}
}

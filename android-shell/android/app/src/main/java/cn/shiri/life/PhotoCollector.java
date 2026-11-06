package cn.shiri.life;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import java.util.ArrayList;
import java.util.List;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import androidx.work.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

final class PhotoCollector {
    static final Object LOCK=new Object();
    private static final Object CONFIG_LOCK=new Object();
    static volatile String workingOwner="";
    static volatile int processed=0;
    static SharedPreferences preferences(Context c){return c.getSharedPreferences("shiri-photo-schedule",Context.MODE_PRIVATE);}
    static File directory(Context c){return new File(c.getFilesDir(),"photo-inbox");}
    static String permission(Context c){
        String full=Build.VERSION.SDK_INT>=33?"android.permission.READ_MEDIA_IMAGES":"android.permission.READ_EXTERNAL_STORAGE";
        if(ContextCompat.checkSelfPermission(c,full)==PackageManager.PERMISSION_GRANTED)return "full";
        if(Build.VERSION.SDK_INT>=34&&ContextCompat.checkSelfPermission(c,"android.permission.READ_MEDIA_VISUAL_USER_SELECTED")==PackageManager.PERMISSION_GRANTED)return "partial";
        return "none";
    }
    static boolean scheduled(Context c)throws Exception{
        for(WorkInfo info:WorkManager.getInstance(c).getWorkInfosForUniqueWork("shiri-photo-clock").get(5,TimeUnit.SECONDS))
            if(!info.getState().isFinished())return true;
        return false;
    }
    static void schedule(Context c,boolean enabled,String time,String owner)throws Exception{synchronized(CONFIG_LOCK){
        if(!CollectionClock.valid(time))throw new IllegalArgumentException("时间无效");
        SharedPreferences p=preferences(c);SharedPreferences.Editor edit=p.edit().putBoolean("enabled",enabled).putString("time",time).putString("owner",owner);
        boolean unchanged=p.getBoolean("enabled",false)&&owner.equals(p.getString("owner","guest"))&&time.equals(p.getString("time","22:00"));
        if(enabled&&(!p.contains("since")||!owner.equals(p.getString("owner","guest"))))edit.putLong("since",CollectionClock.dayStart(System.currentTimeMillis())).putString("completedDay","");
        if(!owner.equals(p.getString("owner","guest")))edit.putLong("lastRun",0).putString("lastStatus","尚未执行。");
        if(!edit.commit())throw new IOException("无法保存自动采集设置，请检查存储后重试");WorkManager manager=WorkManager.getInstance(c);
        if(!enabled){manager.cancelUniqueWork("shiri-photo-clock").getResult().get(10,TimeUnit.SECONDS);manager.cancelUniqueWork("shiri-photo-now").getResult().get(10,TimeUnit.SECONDS);return;}
        PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(PhotoWorker.class,15,TimeUnit.MINUTES)
            .setInitialDelay(CollectionClock.delay(System.currentTimeMillis(),time),TimeUnit.MILLISECONDS)
            .setConstraints(new Constraints.Builder().setRequiresStorageNotLow(true).setRequiresBatteryNotLow(true).build()).build();
        try{manager.enqueueUniquePeriodicWork("shiri-photo-clock",unchanged?ExistingPeriodicWorkPolicy.KEEP:ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,request).getResult().get(10,TimeUnit.SECONDS);}
        catch(Exception error){p.edit().putBoolean("enabled",false).commit();throw new IOException("系统未能建立自动任务，请重试；定时采集保持暂停",error);}
    }}
    static void now(Context c){WorkManager.getInstance(c).enqueueUniqueWork("shiri-photo-now",ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(PhotoWorker.class).setInputData(new Data.Builder().putBoolean("manual",true).build()).build());}
    static JSONObject collect(Context c,boolean manual,BooleanSupplier stopped)throws Exception{
      SharedPreferences p=preferences(c);if(!p.getBoolean("enabled",false))return new JSONObject().put("complete",true);
      if(!manual&&CollectionClock.time(System.currentTimeMillis()).compareTo(p.getString("time","22:00"))<0)return new JSONObject().put("complete",true);
      return scan(c,p.getString("owner","guest"),true,7,0,stopped);
    }
    static JSONObject scan(Context c,String owner,boolean automatic,int days,long until,BooleanSupplier stopped)throws Exception{
      CollectionControls.checkRange(days);
      synchronized(LOCK){
        workingOwner=owner;processed=0;
        try{
        SharedPreferences p=preferences(c);long now=System.currentTimeMillis();
        if(until>now||until<0)throw new IllegalArgumentException("采集时间范围无效");if(until>0)now=until;
        if(permission(c).equals("none"))throw new SecurityException("照片权限已变化，请重新授权");
        File dir=directory(c);if(!dir.exists()&&!dir.mkdirs())throw new IOException("Cannot create inbox");
        int saved=0,skipped=0,existing=0,found=0;boolean complete=true;
        try(PhotoQueue queue=new PhotoQueue(c)){
          queue.cleanOrphans(dir);
          long remaining=300L*1024*1024-queue.queuedBytes();
          long start=automatic?(p.getLong("rescanStart",0)>0?p.getLong("rescanStart",0):Math.max(p.getLong("since",PhotoScanRules.start(now,7)),PhotoScanRules.start(now,7))):PhotoScanRules.start(now,days);
          String where="(("+MediaStore.Images.Media.DATE_TAKEN+">=? AND "+MediaStore.Images.Media.DATE_TAKEN+"<=?) OR ("+MediaStore.Images.Media.DATE_ADDED+">=? AND "+MediaStore.Images.Media.DATE_ADDED+"<=?) OR ("+MediaStore.Images.Media.DATE_MODIFIED+">=? AND "+MediaStore.Images.Media.DATE_MODIFIED+"<=?))";
          if(Build.VERSION.SDK_INT>=29)where+=" AND "+MediaStore.Images.Media.IS_PENDING+"=0 AND "+MediaStore.Images.Media.IS_TRASHED+"=0";
          // IS_TRASHED was introduced in API 30.
          if(Build.VERSION.SDK_INT==29)where=where.replace(" AND "+MediaStore.Images.Media.IS_TRASHED+"=0","");
          List<Uri> volumes=new ArrayList<>();
          if(Build.VERSION.SDK_INT>=29){for(String volume:MediaStore.getExternalVolumeNames(c))volumes.add(MediaStore.Images.Media.getContentUri(volume));}
          else volumes.add(MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
          String[] fields=Build.VERSION.SDK_INT>=30?new String[]{"_id","_display_name","mime_type","_size","date_added","datetaken","date_modified","generation_added","orientation"}:new String[]{"_id","_display_name","mime_type","_size","date_added","datetaken","date_modified","orientation"};
          int failed=0;
          for(Uri collection:volumes){
            String volume=Build.VERSION.SDK_INT>=29?MediaStore.getVolumeName(collection):"external";
            String version=Build.VERSION.SDK_INT>=30?MediaStore.getVersion(c,volume):"legacy";
            long generationNow=Build.VERSION.SDK_INT>=30?MediaStore.getGeneration(c,volume):0;
            long cursor=p.getString("version:"+volume,"").equals(version)?p.getLong("generation:"+volume,0):0;
            String volumeWhere=where;
            if(automatic&&Build.VERSION.SDK_INT>=30&&cursor>0){
              volumeWhere=where.replace(")) AND", ") OR (generation_added>"+cursor+" OR generation_modified>"+cursor+")) AND");
            }
            try(Cursor rows=c.getContentResolver().query(collection,fields,volumeWhere,new String[]{String.valueOf(start),String.valueOf(now),String.valueOf(start/1000),String.valueOf(now/1000),String.valueOf(start/1000),String.valueOf(now/1000)},"_id ASC")){
              if(rows==null){complete=false;continue;}
              while(rows.moveToNext()){
                if(!CollectionControls.allowed(automatic,p.getBoolean("enabled",false),owner,p.getString("owner","guest"),stopped.getAsBoolean())){complete=false;break;}
                found++;processed=found;
                long media=rows.getLong(0),size=rows.getLong(3),added=rows.getLong(4)*1000;
                long stamp=PhotoScanRules.timestamp(rows.getLong(5),rows.getLong(4),rows.getLong(6),now);
                long generation=Build.VERSION.SDK_INT>=30?rows.getLong(7):0;
                int orientation=rows.getInt(Build.VERSION.SDK_INT>=30?8:7);
                String name=rows.getString(1),type=rows.getString(2);
                Uri uri=ContentUris.withAppendedId(collection,media);
                String key=PhotoScanRules.key(owner,uri.toString()+"@"+version,generation,added);
                // Upgrade compatibility for old primary-volume keys; don't revive excluded/imported rows.
                String oldKey=owner+":"+ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,media)+":"+added;
                boolean primary=Build.VERSION.SDK_INT<29||collection.toString().contains("/external_primary/");
                if(queue.seen(key)||primary&&queue.seen(oldKey)){existing++;continue;}
                if(queue.count()>=300||remaining<Math.max(1,Math.min(size,20L*1024*1024))){complete=false;break;}
                String id=UUID.randomUUID().toString();
                File temp=new File(dir,id+".partial"),target=new File(dir,id+".photo");long count=0;
                try {
                  if(type==null||!type.startsWith("image/"))throw new IllegalArgumentException("Unsupported image");
                  boolean convert=!type.matches("image/(jpeg|png|webp|gif)")||size>20L*1024*1024;
                  if(convert){
                    if(size>100L*1024*1024)throw new IllegalArgumentException("Image too large");
                    BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
                    try(InputStream in=c.getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,options);}
                    if(options.outWidth<=0||options.outHeight<=0)throw new IllegalArgumentException("System cannot decode image");
                    options.inJustDecodeBounds=false;options.inSampleSize=1;
                    while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>2560)options.inSampleSize*=2;
                    Bitmap bitmap;try(InputStream in=c.getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in,null,options);}
                    if(bitmap==null)throw new IllegalArgumentException("System cannot decode image");
                    try{
                      if(orientation!=0){Matrix matrix=new Matrix();matrix.postRotate(orientation);Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);if(rotated!=bitmap){bitmap.recycle();bitmap=rotated;}}
                      try(OutputStream output=new FileOutputStream(temp)){if(!bitmap.compress(Bitmap.CompressFormat.JPEG,90,output))throw new IOException("Conversion failed");}
                    }finally{bitmap.recycle();}
                    type="image/jpeg";count=temp.length();
                  }else{
                    try(InputStream input=c.getContentResolver().openInputStream(uri);OutputStream output=new FileOutputStream(temp)){
                      if(input==null)throw new IOException("Photo unavailable");byte[] buffer=new byte[65536];int n;
                      while((n=input.read(buffer))!=-1){
                        if(!CollectionControls.allowed(automatic,p.getBoolean("enabled",false),owner,p.getString("owner","guest"),stopped.getAsBoolean()))throw new IOException("Collection stopped");
                        count+=n;if(count>20L*1024*1024||count>remaining)throw new IOException("Photo exceeds limit");output.write(buffer,0,n);
                      }
                    }
                  }
                  if(!CollectionControls.allowed(automatic,p.getBoolean("enabled",false),owner,p.getString("owner","guest"),stopped.getAsBoolean()))throw new IOException("Collection stopped");
                  if(count>remaining){complete=false;temp.delete();break;}
                  if(!temp.renameTo(target))throw new IOException("Cannot commit photo");
                  queue.add(owner,id,key,target.getAbsolutePath(),name==null?"照片":name,type,added,count,"pending");queue.captureDate(owner,id,stamp);saved++;remaining-=count;
                }catch(IllegalArgumentException e){temp.delete();target.delete();queue.add(owner,id,key,"",name==null?"照片":name,type==null?"unknown":type,added,0,"skipped");queue.captureDate(owner,id,stamp);skipped++;}
                catch(SecurityException e){temp.delete();target.delete();throw e;}
                catch(IOException e){temp.delete();target.delete();if(CollectionControls.allowed(automatic,p.getBoolean("enabled",false),owner,p.getString("owner","guest"),stopped.getAsBoolean()))failed++;complete=false;}
              }
            }
            if(automatic&&complete&&permission(c).equals("full"))p.edit().putLong("generation:"+volume,generationNow).putString("version:"+volume,version).commit();
            // Capacity may be reached exactly at a volume boundary; later volumes still need a pass.
            if(queue.count()>=300||remaining<1){complete=false;break;}
          }
          queue.summary(owner,now);
          JSONObject result=new JSONObject().put("found",found).put("staged",saved).put("existing",existing).put("failed",failed).put("unsupported",skipped).put("complete",complete).put("until",now);
          SharedPreferences.Editor update=p.edit().putLong("lastRun:"+owner,System.currentTimeMillis()).putString("result:"+owner,result.toString()).remove("error:"+owner);
          if(automatic&&owner.equals(p.getString("owner","guest"))){update.putLong("lastRun",now).putString("lastStatus","本次暂存 "+saved+" 张，已存在 "+existing+" 张，失败或格式不支持 "+(failed+skipped)+" 张。"+(complete?"":"还有照片待整理，请继续采集。"));update.putBoolean("scanComplete",complete);if(complete)update.remove("rescanStart");}
          if(!update.commit())throw new IOException("采集结果未能保存，原有照片保留，请刷新后核对");
          return result;
        }
        }catch(Exception error){
          preferences(c).edit().putString("error:"+owner,error instanceof SecurityException?"照片权限已变化，请重新授权。":"相册读取或本机存储未完成，请检查权限和存储后重试。").commit();throw error;
        }finally{workingOwner="";processed=0;}
      }
    }
}

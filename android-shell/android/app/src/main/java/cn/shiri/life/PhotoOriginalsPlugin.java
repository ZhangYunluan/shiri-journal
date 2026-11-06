package cn.shiri.life;

import android.Manifest;
import android.app.Activity;
import android.database.Cursor;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.media.ExifInterface;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Explicit, foreground-only source operations. Never accepts a caller-supplied URI or file path. */
@CapacitorPlugin(name="PhotoOriginals",permissions={@Permission(alias="location",strings={Manifest.permission.ACCESS_MEDIA_LOCATION})})
public class PhotoOriginalsPlugin extends Plugin {
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private PluginCall deleteCall;private List<Verified> deleting;private JSONArray failures;
 private static class Verified {String id;Uri uri;Verified(String id,Uri uri){this.id=id;this.uri=uri;}}
 private String owner(PluginCall call){String owner=call.getString("owner","");if(!owner.matches("guest|SR[A-Z0-9]{12}|CB(?:[a-f0-9]{2}){1,64}"))throw new IllegalArgumentException("空间无效");return owner;}
 private PhotoSourceRules.Source source(String owner,String id,boolean deletion)throws Exception{
  if(!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("照片编号无效");
  try(PhotoQueue q=new PhotoQueue(getContext());Cursor c=q.getReadableDatabase().rawQuery("SELECT media_key,state FROM photos WHERE owner=? AND id=?",new String[]{owner,id})){
   if(!c.moveToFirst())throw new IllegalArgumentException("没有本机原图关联");
   if(deletion&&!c.getString(1).equals("imported"))throw new SecurityException("照片已保存、已移除或不在首次审核范围内");
   PhotoSourceRules.Source s=PhotoSourceRules.parse(c.getString(0),owner);if(s==null)throw new IllegalArgumentException("旧索引无法安全核验，请仅从拾日排除");
   if(Build.VERSION.SDK_INT<30||!s.version.equals(MediaStore.getVersion(getContext(),MediaStore.getVolumeName(Uri.parse(s.uri)))))throw new SecurityException("媒体索引已变化，请仅排除或重新采集");
   return s;
  }
 }
 private boolean matches(PhotoSourceRules.Source s)throws Exception{
  try(Cursor c=getContext().getContentResolver().query(Uri.parse(s.uri),new String[]{"generation_added"},null,null,null)){
   return c!=null&&c.moveToFirst()&&c.getLong(0)==s.generation;
  }
 }
 @PluginMethod public void originalsCapabilities(PluginCall call){call.resolve(new JSObject().put("supported",Build.VERSION.SDK_INT>=30));}
 @PluginMethod public void protect(PluginCall call){worker.execute(()->{try{
  String owner=owner(call);JSONArray ids=call.getArray("ids");if(ids==null||ids.length()>300)throw new IllegalArgumentException("保护列表无效");
  try(PhotoQueue q=new PhotoQueue(getContext())){ContentValues value=new ContentValues();value.put("state","saved");for(int i=0;i<ids.length();i++){String id=ids.getString(i);if(!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("照片编号无效");q.getWritableDatabase().update("photos",value,"owner=? AND id=? AND state='imported'",new String[]{owner,id});}}
  call.resolve(new JSObject().put("ok",true));
 }catch(Exception e){call.reject("原图保护状态未能确认，请稍后重试。");}});}
 @PluginMethod public void location(PluginCall call){
  // Validate the associated source before requesting the optional metadata permission.
  worker.execute(()->{try{source(owner(call),call.getString("id",""),false);
   if(Build.VERSION.SDK_INT>=29&&getPermissionState("location")!=PermissionState.GRANTED){
    if(Boolean.TRUE.equals(call.getBoolean("requestPermission")))getActivity().runOnUiThread(()->requestPermissionForAlias("location",call,"locationPermission"));
    else call.resolve(new JSObject().put("available",false));
   }else readLocation(call);
  }catch(Exception e){call.resolve(new JSObject().put("available",false));}});
 }
 @PermissionCallback private void locationPermission(PluginCall call){worker.execute(()->readLocation(call));}
 private void readLocation(PluginCall call){try{
  if(Build.VERSION.SDK_INT>=29&&getPermissionState("location")!=PermissionState.GRANTED){call.resolve(new JSObject().put("available",false).put("denied",true));return;}
  PhotoSourceRules.Source s=source(owner(call),call.getString("id",""),false);if(!matches(s))throw new SecurityException();
  Uri uri=Uri.parse(s.uri);if(Build.VERSION.SDK_INT>=29)uri=MediaStore.setRequireOriginal(uri);
  try(InputStream in=getContext().getContentResolver().openInputStream(uri)){
   float[] gps=new float[2];boolean found=in!=null&&new ExifInterface(in).getLatLong(gps);
   if(found&&Float.isFinite(gps[0])&&Float.isFinite(gps[1])&&Math.abs(gps[0])<=90&&Math.abs(gps[1])<=180)call.resolve(new JSObject().put("available",true).put("latitude",gps[0]).put("longitude",gps[1]));
   else call.resolve(new JSObject().put("available",false));
  }
 }catch(Exception e){call.resolve(new JSObject().put("available",false));}}
 private String hash(Uri uri)throws Exception{
  MessageDigest digest=MessageDigest.getInstance("SHA-256");long count=0;byte[] buffer=new byte[65536];
  try(InputStream in=getContext().getContentResolver().openInputStream(uri)){if(in==null)throw new SecurityException();int n;while((n=in.read(buffer))!=-1){count+=n;if(count>20L*1024*1024)throw new SecurityException();digest.update(buffer,0,n);}}
  StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();
 }
 @PluginMethod public void deleteOriginals(PluginCall call){worker.execute(()->{
  if(deleteCall!=null){call.reject("已有系统删除请求，请先完成确认。");return;}
  try{
   if(Build.VERSION.SDK_INT<30)throw new IllegalArgumentException("当前 Android 版本请从系统相册删除；拾日仅支持安全排除。");
   String owner=owner(call);JSONArray photos=call.getArray("photos");if(photos==null||photos.length()<1||photos.length()>300)throw new IllegalArgumentException("一次请选择 1–300 张照片");
   List<Verified> accepted=new ArrayList<>();JSONArray failed=new JSONArray();Set<String> ids=new HashSet<>(),uris=new HashSet<>();
   for(int i=0;i<photos.length();i++){
    JSONObject item=photos.getJSONObject(i);String id=item.optString("id"),sha=item.optString("sha256");
    if(!ids.add(id))throw new IllegalArgumentException("重复照片编号");
    try{
     if(!sha.matches("[a-f0-9]{64}"))throw new SecurityException();PhotoSourceRules.Source s=source(owner,id,true);Uri uri=Uri.parse(s.uri);
     // A source referenced by another saved moment/account is never eligible.
     try(PhotoQueue q=new PhotoQueue(getContext());Cursor rows=q.getReadableDatabase().rawQuery("SELECT owner,media_key,state FROM photos WHERE id<>? AND(state='saved' OR owner<>?)",new String[]{id,owner})){
      while(rows.moveToNext()){PhotoSourceRules.Source other=PhotoSourceRules.parse(rows.getString(1),rows.getString(0));if(other!=null&&other.uri.equals(s.uri))throw new SecurityException();}
     }
     if(!matches(s)||!hash(uri).equals(sha)||!uris.add(s.uri))throw new SecurityException();accepted.add(new Verified(id,uri));
    }catch(Exception e){failed.put(new JSONObject().put("id",id).put("reason","原图不可访问、已变化、已被其他记录使用或无法核验；请仅排除或稍后重试。"));}
   }
   if(accepted.isEmpty()){call.resolve(new JSObject().put("deleted",new JSONArray()).put("failed",failed).put("cancelled",false));return;}
   List<Uri> request=new ArrayList<>();for(Verified v:accepted)request.add(v.uri);
   android.app.PendingIntent intent=MediaStore.createDeleteRequest(getContext().getContentResolver(),request);
   deleteCall=call;deleting=accepted;failures=failed;
   getActivity().runOnUiThread(()->{try{((MainActivity)getActivity()).requestPhotoDeletion(intent,result->worker.execute(()->finishDelete(result)));}catch(Exception e){deleteCall=null;deleting=null;failures=null;call.reject("无法打开系统删除确认，原审核列表保留。");}});
  }catch(Exception e){call.reject(e.getMessage()==null?"系统删除未完成，审核列表保留。":e.getMessage());}
 });}
 private void finishDelete(int result){
  PluginCall call=deleteCall;if(call==null)return;
  try{
   JSONArray removed=new JSONArray();if(result==Activity.RESULT_OK){
    try(PhotoQueue q=new PhotoQueue(getContext())){for(Verified item:deleting){
     try(Cursor c=getContext().getContentResolver().query(item.uri,new String[]{"_id"},null,null,null)){
      if(c==null||c.moveToFirst()||PhotoCollector.permission(getContext()).equals("none"))throw new SecurityException();
      ContentValues value=new ContentValues();value.put("state","original_deleted");q.getWritableDatabase().update("photos",value,"owner=? AND id=?",new String[]{owner(call),item.id});removed.put(item.id);
     }catch(Exception e){failures.put(new JSONObject().put("id",item.id).put("reason","系统未能确认该原图已删除，请重试或仅从拾日排除。"));}
    }}
   }
   call.resolve(new JSObject().put("deleted",removed).put("failed",failures).put("cancelled",result!=Activity.RESULT_OK));
  }catch(Exception e){call.reject("无法确认系统删除结果，候选列表保留，请核对相册。");}
  finally{deleteCall=null;deleting=null;failures=null;}
 }
 @Override protected void handleOnDestroy(){worker.shutdown();}
}

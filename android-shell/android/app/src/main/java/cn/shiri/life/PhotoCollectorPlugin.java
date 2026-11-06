package cn.shiri.life;

import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONArray;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="PhotoCollector",permissions={
    @Permission(alias="legacy",strings={"android.permission.READ_EXTERNAL_STORAGE"}),
    @Permission(alias="images",strings={"android.permission.READ_MEDIA_IMAGES"}),
    @Permission(alias="selected",strings={"android.permission.READ_MEDIA_VISUAL_USER_SELECTED"})
})
public class PhotoCollectorPlugin extends Plugin {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    // Pause/status cannot wait behind a long MediaStore scan on the IO executor.
    private final ExecutorService controls=Executors.newSingleThreadExecutor();
    @PluginMethod public void authorize(PluginCall call){
        if(Build.VERSION.SDK_INT>=34)requestPermissionForAliases(new String[]{"images","selected"},call,"permissionResult");
        else requestPermissionForAlias(Build.VERSION.SDK_INT>=33?"images":"legacy",call,"permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call){status(call);}
    @PluginMethod public void openSettings(PluginCall call){
        getActivity().runOnUiThread(()->{try{
            android.content.Intent intent=new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package",getContext().getPackageName(),null));
            getActivity().startActivity(intent);call.resolve(new JSObject().put("opened",true));
        }catch(Exception error){call.reject("无法打开系统设置，请在系统设置中找到拾日并调整照片权限。");}});
    }
    @PluginMethod public void configureCloud(PluginCall call){execute(call,()->{
        // Unreviewed gallery uploads are permanently retired; saved moments sync in the app queue.
        PrivateUpload.configure(getContext(),owner(call),false,null);return new JSObject().put("ok",true);
    });}
    @PluginMethod public void status(PluginCall call){control(call,()->{
        android.content.SharedPreferences p=PhotoCollector.preferences(getContext());JSObject result=new JSObject();
        boolean same=owner(call).equals(p.getString("owner","guest")),requested=p.getBoolean("enabled",false)&&same;
        boolean scheduled=requested&&PhotoCollector.scheduled(getContext());
        result.put("enabled",requested&&scheduled);result.put("requested",requested);result.put("scheduled",scheduled);result.put("time",p.getString("time","22:00"));result.put("permission",PhotoCollector.permission(getContext()));
        result.put("canRequestPermission",getPermissionState(Build.VERSION.SDK_INT>=33?"images":"legacy")!=PermissionState.DENIED);
        result.put("canReselect",Build.VERSION.SDK_INT>=34);result.put("running",owner(call).equals(PhotoCollector.workingOwner));result.put("processed",owner(call).equals(PhotoCollector.workingOwner)?PhotoCollector.processed:0);
        result.put("lastRun",p.getLong("lastRun:"+owner(call),same?p.getLong("lastRun",0):0));result.put("lastStatus",same?p.getString("lastStatus","尚未执行。"):"尚未执行。");result.put("lastError",p.getString("error:"+owner(call),""));
        if(p.contains("result:"+owner(call)))result.put("lastResult",new org.json.JSONObject(p.getString("result:"+owner(call),"{}")));
        result.put("cloudEnabled",PrivateUpload.enabled(getContext(),owner(call)));result.put("cloudStatus",PrivateUpload.enabled(getContext(),owner(call))?PrivateUpload.prefs(getContext()).getString("status","等待私人上传"):"私人上传未开启");
        result.put("scanComplete",p.getBoolean("scanComplete",false));
        try(PhotoQueue q=new PhotoQueue(getContext())){result.put("pending",q.count(owner(call)));result.put("counts",q.counts(owner(call)));result.put("summaries",q.summaries(owner(call)));}return result;
    });}
    @PluginMethod public void configure(PluginCall call){control(call,()->{
        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled"));String time=call.getString("time","22:00");
        if(enabled&&PhotoCollector.permission(getContext()).equals("none"))throw new SecurityException("请先授权相册读取");
        PhotoCollector.schedule(getContext(),enabled,time,owner(call));return new JSObject().put("ok",true);
    });}
    @PluginMethod public void runNow(PluginCall call){execute(call,()->{
        if(PhotoCollector.permission(getContext()).equals("none"))throw new SecurityException("请先允许照片访问；定时采集可保持暂停");
        boolean automatic=Boolean.TRUE.equals(call.getBoolean("automatic"));
        if(automatic&&(!PhotoCollector.preferences(getContext()).getBoolean("enabled",false)||!owner(call).equals(PhotoCollector.preferences(getContext()).getString("owner","guest"))))return new JSObject().put("complete",true);
        int days=call.getInt("days",Boolean.TRUE.equals(call.getBoolean("recentSeven"))?7:1);CollectionControls.checkRange(days);
        long until=call.getLong("until",0L);
        if(!automatic&&days==7&&until==0)try(PhotoQueue q=new PhotoQueue(getContext())){q.getWritableDatabase().delete("photos","owner=? AND state='skipped' AND day>=?",new String[]{owner(call),CollectionClock.day(PhotoScanRules.start(System.currentTimeMillis(),7))});}
        return new JSObject(PhotoCollector.scan(getContext(),owner(call),automatic,days,until,()->false).toString());
    });}
    @PluginMethod public void pending(PluginCall call){execute(call,()->{try(PhotoQueue q=new PhotoQueue(getContext())){return new JSObject().put("photos",q.pending(owner(call)));}});}
    @PluginMethod public void acknowledge(PluginCall call){execute(call,()->{
        String id=call.getString("id","");if(!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("无效队列编号");
        try(PhotoQueue q=new PhotoQueue(getContext())){q.acknowledge(owner(call),id,PhotoCollector.directory(getContext()),Boolean.TRUE.equals(call.getBoolean("discard")));}return new JSObject().put("ok",true);
    });}
    @PluginMethod public void clearQueue(PluginCall call){execute(call,()->{
        String owner=owner(call);
        PrivateUpload.configure(getContext(),owner,false,null);
        if(owner.equals(PhotoCollector.preferences(getContext()).getString("owner","guest")))PhotoCollector.schedule(getContext(),false,"22:00",owner);
        synchronized(PhotoCollector.LOCK){
            try(PhotoQueue q=new PhotoQueue(getContext())){
                JSONArray pending;
                while((pending=q.pending(owner)).length()>0)for(int i=0;i<pending.length();i++)q.acknowledge(owner,pending.getJSONObject(i).getString("id"),PhotoCollector.directory(getContext()),true);
                q.getWritableDatabase().delete("photos","owner=?",new String[]{owner});q.getWritableDatabase().delete("summaries","owner=?",new String[]{owner});
                q.cleanOrphans(PhotoCollector.directory(getContext()));
            }
            if(owner.equals(PhotoCollector.preferences(getContext()).getString("owner","guest")))PhotoCollector.preferences(getContext()).edit().clear().apply();
        }return new JSObject().put("ok",true);
    });}
    private interface Operation{JSObject run()throws Exception;}
    private String owner(PluginCall call){String id=call.getString("owner","guest");if(!id.matches("guest|SR[A-Z0-9]{12}|CB(?:[a-f0-9]{2}){1,64}"))throw new IllegalArgumentException("空间 ID 无效");return id;}
    private void execute(PluginCall call,Operation op){executor.execute(()->{try{call.resolve(op.run());}catch(Exception e){call.reject(e.getMessage()==null?"操作未完成":e.getMessage());}});}
    private void control(PluginCall call,Operation op){controls.execute(()->{try{call.resolve(op.run());}catch(Exception e){call.reject(e.getMessage()==null?"设置未能确认，请刷新重试":e.getMessage());}});}
    @Override protected void handleOnDestroy(){executor.shutdown();controls.shutdown();}
}

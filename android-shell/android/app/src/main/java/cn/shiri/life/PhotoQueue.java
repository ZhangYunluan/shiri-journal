package cn.shiri.life;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;

/** Durable private staging. The original gallery is never modified. */
final class PhotoQueue extends SQLiteOpenHelper {
    PhotoQueue(Context c){super(c,"shiri-photo-queue.sqlite",null,3);setWriteAheadLoggingEnabled(true);}
    public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE photos(id TEXT PRIMARY KEY,media_key TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,added INTEGER NOT NULL,day TEXT NOT NULL,bytes INTEGER NOT NULL,state TEXT NOT NULL,cloud_uploaded INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE TABLE summaries(owner TEXT NOT NULL,day TEXT NOT NULL,text TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,day))");
        db.execSQL("ALTER TABLE photos ADD COLUMN taken INTEGER NOT NULL DEFAULT 0");
    }
    public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){if(oldVersion<2)db.execSQL("ALTER TABLE photos ADD COLUMN cloud_uploaded INTEGER NOT NULL DEFAULT 0");if(oldVersion<3)db.execSQL("ALTER TABLE photos ADD COLUMN taken INTEGER NOT NULL DEFAULT 0");}
    void retrySkipped(String owner){getWritableDatabase().delete("photos","owner=? AND state='skipped'",new String[]{owner});}
    void captureDate(String owner,String id,long taken){ContentValues v=new ContentValues();v.put("taken",taken);v.put("day",CollectionClock.day(taken));getWritableDatabase().update("photos",v,"owner=? AND id=?",new String[]{owner,id});}
    JSONObject counts(String owner)throws Exception{
        JSONObject out=new JSONObject();try(Cursor c=getReadableDatabase().rawQuery("SELECT state,COUNT(*) FROM photos WHERE owner=? GROUP BY state",new String[]{owner})){while(c.moveToNext())out.put(c.getString(0),c.getInt(1));}return out;
    }
    JSONArray uploadPending(String owner)throws Exception{
        JSONArray result=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,path,name,added,day FROM photos WHERE owner=? AND state='pending' AND cloud_uploaded=0 ORDER BY added LIMIT 5",new String[]{owner})){
            while(c.moveToNext())result.put(new JSONObject().put("id",c.getString(0)).put("path",c.getString(1)).put("name",c.getString(2)).put("added",c.getLong(3)).put("date",c.getString(4)));
        }return result;
    }
    void uploaded(String owner,String id){ContentValues v=new ContentValues();v.put("cloud_uploaded",1);getWritableDatabase().update("photos",v,"owner=? AND id=?",new String[]{owner,id});}
    void uploadDeferred(String owner,String id){ContentValues v=new ContentValues();v.put("cloud_uploaded",-1);getWritableDatabase().update("photos",v,"owner=? AND id=?",new String[]{owner,id});}
    boolean seen(String key){try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM photos WHERE media_key=?",new String[]{key})){return c.moveToFirst();}}
    // Only generated files in the private inbox are eligible for recovery cleanup.
    void cleanOrphans(File directory)throws Exception{
        File[] files=directory.listFiles();if(files==null)return;
        for(File f:files){
            if(!f.getName().matches("[a-f0-9-]{36}\\.(partial|photo)")||!f.getCanonicalPath().startsWith(directory.getCanonicalPath()+File.separator))continue;
            boolean pending;try(Cursor c=getReadableDatabase().rawQuery("SELECT 1 FROM photos WHERE path=? AND state='pending'",new String[]{f.getAbsolutePath()})){pending=c.moveToFirst();}
            if(!pending&&f.isFile())f.delete();
        }
    }
    long queuedBytes(){try(Cursor c=getReadableDatabase().rawQuery("SELECT COALESCE(SUM(bytes),0) FROM photos WHERE state='pending'",null)){c.moveToFirst();return c.getLong(0);}}
    int count(){try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM photos WHERE state='pending'",null)){c.moveToFirst();return c.getInt(0);}}
    int count(String owner){try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*) FROM photos WHERE state='pending' AND owner=?",new String[]{owner})){c.moveToFirst();return c.getInt(0);}}
    void add(String owner,String id,String key,String path,String name,String type,long added,long bytes,String state){
        ContentValues v=new ContentValues();v.put("id",id);v.put("media_key",key);v.put("path",path);v.put("name",name);v.put("type",type);v.put("added",added);v.put("day",CollectionClock.day(added));v.put("bytes",bytes);v.put("state",state);
        v.put("owner",owner);getWritableDatabase().insertOrThrow("photos",null,v);
    }
    JSONArray pending(String owner) throws Exception{
        JSONArray rows=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,path,name,type,added,day,taken FROM photos WHERE state='pending' AND owner=? ORDER BY added,id LIMIT 30",new String[]{owner})){
            while(c.moveToNext()){JSONObject r=new JSONObject();r.put("id",c.getString(0));r.put("path",c.getString(1));r.put("name",c.getString(2));r.put("type",c.getString(3));r.put("added",c.getLong(4));r.put("date",c.getString(5));r.put("taken",c.getLong(6)>0?c.getLong(6):c.getLong(4));rows.put(r);}
        }return rows;
    }
    void acknowledge(String owner,String id,File directory,boolean discarded)throws Exception{
        String path=null;try(Cursor c=getReadableDatabase().rawQuery("SELECT path FROM photos WHERE id=? AND state='pending' AND owner=?",new String[]{id,owner})){if(c.moveToFirst())path=c.getString(0);}
        if(path==null)return;File f=new File(path);
        if(!f.getCanonicalPath().startsWith(directory.getCanonicalPath()+File.separator))throw new SecurityException("Invalid staging path");
        ContentValues v=new ContentValues();v.put("state",discarded?"discarded":"imported");v.put("path","");getWritableDatabase().update("photos",v,"id=?",new String[]{id});
        // Commit acknowledgment first. A crash before deletion leaves an orphan that cleanup can remove.
        if(f.exists())f.delete();
    }
    void summary(String owner,long now){
        try(Cursor c=getReadableDatabase().rawQuery("SELECT day,COUNT(*),SUM(CASE WHEN state='skipped' THEN 1 ELSE 0 END) FROM photos WHERE owner=? GROUP BY day ORDER BY day DESC LIMIT 30",new String[]{owner})){
            while(c.moveToNext()){int total=c.getInt(1),skipped=c.getInt(2);String text="新增照片 "+total+" 张，可整理 "+(total-skipped)+" 张，格式或大小不支持 "+skipped+" 张。此为本机采集统计；照片内容、分类和情绪尚未确认。打开应用后继续本地识别与复盘。";
                ContentValues v=new ContentValues();v.put("owner",owner);v.put("day",c.getString(0));v.put("text",text);v.put("updated",now);getWritableDatabase().insertWithOnConflict("summaries",null,v,SQLiteDatabase.CONFLICT_REPLACE);
            }
        }
    }
    JSONArray summaries(String owner)throws Exception{JSONArray rows=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT day,text,updated FROM summaries WHERE owner=? ORDER BY day DESC LIMIT 30",new String[]{owner})){while(c.moveToNext()){JSONObject r=new JSONObject();r.put("date",c.getString(0));r.put("text",c.getString(1));r.put("updated",c.getLong(2));rows.put(r);}}return rows;}
}

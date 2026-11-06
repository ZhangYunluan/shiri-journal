package cn.shiri.life;

import java.util.Calendar;

/** Pure rules: MediaStore taken is milliseconds, added/modified are seconds. */
final class PhotoScanRules {
    static long start(long now,int days){Calendar c=Calendar.getInstance();c.setTimeInMillis(CollectionClock.dayStart(now));c.add(Calendar.DAY_OF_YEAR,-Math.max(0,days-1));return c.getTimeInMillis();}
    static long timestamp(long taken,long added,long modified,long now){
        if(taken>0&&taken<=now+86400000L)return taken;
        if(added>0)return added*1000L;
        return modified>0?modified*1000L:now;
    }
    static boolean recent(long taken,long added,long modified,long start,long end){return taken>=start&&taken<=end||added>=start/1000&&added<=end/1000||modified>=start/1000&&modified<=end/1000;}
    static String key(String owner,String uri,long generation,long added){return owner+":"+uri+":"+(generation>0?"g"+generation:"a"+added);}
}

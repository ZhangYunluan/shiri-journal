package cn.shiri.life;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.TimeZone;

public class PhotoScanRulesTest {
 @Test public void importsAndDates(){long now=1791882000000L,start=PhotoScanRules.start(now,7);
  assertTrue(PhotoScanRules.recent(start-30L*86400000,now/1000,0,start,now));
  assertTrue(PhotoScanRules.recent(0,0,now/1000,start,now));
  assertFalse(PhotoScanRules.recent(0,0,0,start,now));
  assertEquals(start-30L*86400000,PhotoScanRules.timestamp(start-30L*86400000,now/1000,0,now));
  assertEquals(now,PhotoScanRules.timestamp(0,now/1000,0,now));
 }
 @Test public void stableIdentity(){
  assertNotEquals(PhotoScanRules.key("a","content://v1/1",10,1),PhotoScanRules.key("a","content://v2/1",10,1));
  assertNotEquals(PhotoScanRules.key("a","content://v1/1",10,1),PhotoScanRules.key("a","content://v1/2",10,1));
  assertEquals(PhotoScanRules.key("a","content://v1/1",10,1),PhotoScanRules.key("a","content://v1/1",10,2));
 }
 @Test public void localDays(){TimeZone old=TimeZone.getDefault();try{TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));long now=1791882000000L;assertEquals("00:00",CollectionClock.time(PhotoScanRules.start(now,7)));}finally{TimeZone.setDefault(old);}}
}

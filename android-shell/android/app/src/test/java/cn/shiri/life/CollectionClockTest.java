package cn.shiri.life;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Calendar;
import java.util.TimeZone;

public class CollectionClockTest {
    @Test public void schedulesNextLocalEveningAndRollsAcrossYear(){
        TimeZone previous=TimeZone.getDefault();TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        try{Calendar c=Calendar.getInstance();c.set(2026,11,31,21,0,0);c.set(Calendar.MILLISECOND,0);long now=c.getTimeInMillis();
            assertEquals(3600000L,CollectionClock.delay(now,"22:00"));
            assertEquals(86400000L,CollectionClock.delay(now+3600000,"22:00"));
            assertEquals("2027-01-01",CollectionClock.day(now+86400000L));
            assertFalse(CollectionClock.valid("24:00"));assertFalse(CollectionClock.valid("9:00"));assertTrue(CollectionClock.valid("00:00"));
        }finally{TimeZone.setDefault(previous);}
    }
}

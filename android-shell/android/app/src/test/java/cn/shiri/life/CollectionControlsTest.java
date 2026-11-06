package cn.shiri.life;
import org.junit.Test;
import static org.junit.Assert.*;
public class CollectionControlsTest {
 @Test public void manualDoesNotDependOnTimerOrOtherAccounts(){
  assertTrue(CollectionControls.allowed(false,false,"CBaa","CBbb",false));
  assertFalse(CollectionControls.allowed(true,false,"CBaa","CBaa",false));
  assertFalse(CollectionControls.allowed(true,true,"CBaa","CBbb",false));
  assertFalse(CollectionControls.allowed(false,false,"CBaa","CBaa",true));
  assertTrue(CollectionControls.allowed(true,true,"CBaa","CBaa",false));
 }
 @Test public void rangeAndContinuationStayBounded(){
  CollectionControls.checkRange(1);CollectionControls.checkRange(7);
  try{CollectionControls.checkRange(30);fail();}catch(IllegalArgumentException expected){}
 }
}

package cn.shiri.life;
import org.junit.Test;
import static org.junit.Assert.*;
public class PhotoSourceRulesTest {
 @Test public void acceptsOnlyAnOwnedVersionedMediaImage(){
  PhotoSourceRules.Source s=PhotoSourceRules.parse("guest:content://media/external_primary/images/media/123@v1:g7","guest");
  assertNotNull(s);assertEquals(7,s.generation);assertEquals("v1",s.version);
  assertNull(PhotoSourceRules.parse("guest:content://media/external_primary/images/media/123@v1:g7","CBaa"));
  assertNull(PhotoSourceRules.parse("guest:file:///storage/DCIM/a.jpg@v1:g7","guest"));
  assertNull(PhotoSourceRules.parse("guest:content://other/external/images/media/123@v1:g7","guest"));
  assertNull(PhotoSourceRules.parse("guest:content://media/internal/images/media/123@v1:g7","guest"));
  assertNull(PhotoSourceRules.parse("guest:content://media/external/images/media/123:1792000000","guest"));
 }
}

"""Render exact educational brand graphics; these are not account screenshots."""
from pathlib import Path
from io import BytesIO
import zipfile,subprocess
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import HexColor
import arabic_reshaper
from bidi.algorithm import get_display
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/member-kit/stories';OUT.mkdir(parents=True,exist_ok=True)
logo=Image.open(ROOT/'public/assets/brand/homanet-mark-orange.png');logo.thumbnail((160,160));LOGO=ImageReader(logo)
pdfmetrics.registerFont(TTFont('Story','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
stories=[
 ('register','عضویت در هما نت',['صفحهٔ ثبت‌نام را باز کنید.','اطلاعات حساب را وارد کنید.','تأیید حساب را انجام دهید.'],'رمز و کد تأیید را به کسی ندهید.','homanets.com/register'),
 ('shopping','انتخاب و خرید',['مشخصات و قیمت ریالی را ببینید.','تعداد را انتخاب کنید.','محصول را به سبد اضافه کنید.'],'مبلغ نهایی را در سبد بررسی کنید.','homanets.com/shop'),
 ('orders','پیگیری سفارش',['وارد حساب کاربری شوید.','بخش سفارش‌ها را باز کنید.','وضعیت خرید را بررسی کنید.'],'پیش از پرداخت دوباره، نتیجه را ببینید.','homanets.com/account'),
 ('support','پشتیبانی همراه شما',['بخش پشتیبانی را باز کنید.','موضوع و شماره سفارش را بنویسید.','تیکت را ثبت و پاسخ را پیگیری کنید.'],'توضیح روشن، پیگیری را آسان‌تر می‌کند.','homanets.com/account'),
]
def text(c,value,y,size=17,color='#1E2A44',x=376):
 c.setFillColor(HexColor(color));c.setFont('Story',size);c.drawRightString(x,768-y,get_display(arabic_reshaper.reshape(value)))
for i,(key,title,lines,note,url) in enumerate(stories,1):
 tmp=Path('/tmp')/('homa-story-'+key+'.pdf');c=canvas.Canvas(str(tmp),pagesize=(432,768))
 c.setFillColor(HexColor('#F2E8D3'));c.rect(0,0,432,768,fill=1,stroke=0)
 c.setFillColor(HexColor('#FFFFFF'));c.roundRect(24,24,384,720,24,fill=1,stroke=0)
 c.setFillColor(HexColor('#0F6E72'));c.roundRect(24,504,384,240,24,fill=1,stroke=0)
 c.drawImage(LOGO,48,660,66,66,mask='auto',preserveAspectRatio=True)
 text(c,'باشگاه مشتریان هما نت',83,13,'#F2E8D3');text(c,title,167,24,'#FFFFFF');text(c,'راهنمای شروع',214,14,'#F2E8D3')
 c.setFillColor(HexColor('#D4B87B'));c.circle(75,543,25,fill=1,stroke=0);c.setFont('Story',24);c.setFillColor(HexColor('#1E2A44'));c.drawCentredString(75,534,str(i).zfill(2))
 for j,line in enumerate(lines):
  y=326+j*88;c.setFillColor(HexColor('#F1F6F5'));c.roundRect(48,768-y-34,336,69,12,fill=1,stroke=0);text(c,line,y+7,15)
 c.setStrokeColor(HexColor('#D4B87B'));c.line(48,188,384,188);text(c,note,620,13)
 c.setFont('Story',15);c.setFillColor(HexColor('#0F6E72'));c.drawCentredString(216,84,url);c.save()
 subprocess.run(['pdftoppm','-png','-singlefile','-scale-to','1920',str(tmp),str(OUT/key)],check=True)
with zipfile.ZipFile(ROOT/'public/member-kit/stories-fa.zip','w',compression=zipfile.ZIP_DEFLATED) as bundle:
 for key,*_ in stories:bundle.write(OUT/(key+'.png'),arcname=key+'.png')
print('Four story graphics and ZIP created.')

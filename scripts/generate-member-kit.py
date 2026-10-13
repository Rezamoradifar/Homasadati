"""Generate the Persian member guide and share image (reportlab, bidi, arabic-reshaper)."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image
import arabic_reshaper
from bidi.algorithm import get_display
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/member-kit'
OUT.mkdir(parents=True,exist_ok=True)
logo=Image.open(ROOT/'public/assets/brand/homanet-mark-orange.png');logo.thumbnail((256,256));LOGO=ImageReader(logo)
pdfmetrics.registerFont(TTFont('Kit','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
INK=HexColor('#1E2A44');TEAL=HexColor('#0F6E72');CREAM=HexColor('#F2E8D3');GOLD=HexColor('#D4B87B')
def rtl(text):return get_display(arabic_reshaper.reshape(text))
def text(c,value,x,y,size=11,color=INK):
    c.setFillColor(color);c.setFont('Kit',size);c.drawRightString(x,y,rtl(value))
def paragraph(c,value,y,width=500,size=11,x=550):
    words=value.split();line=''
    for word in words:
        candidate=(line+' '+word).strip()
        if pdfmetrics.stringWidth(rtl(candidate),'Kit',size)>width and line:
            text(c,line,x,y,size);y-=24;line=word
        else:line=candidate
    if line:text(c,line,x,y,size);y-=24
    return y-12
def heading(c,title,y):
    c.setFillColor(TEAL);c.roundRect(40,y-10,515,40,8,fill=1,stroke=0);text(c,title,535,y+3,14,HexColor('#FFFFFF'));return y-42
def page(c,num,title):
    c.setFillColor(CREAM);c.rect(0,0,595,842,fill=1,stroke=0)
    c.drawImage(LOGO,40,750,60,60,mask='auto',preserveAspectRatio=True)
    text(c,'باشگاه مشتریان هما نت',550,790,13,TEAL);text(c,title,550,750,23)
    c.setStrokeColor(GOLD);c.line(40,720,555,720)
    c.setFont('Kit',10);c.setFillColor(INK);c.drawString(40,30,'homanets.com');text(c,'راهنمای شروع | '+str(num),550,30,10)
    return 680
c=canvas.Canvas(str(OUT/'guide-fa.pdf'),pagesize=(595,842));c.setTitle('راهنمای شروع در هما نت');c.setAuthor('Homanet')
y=page(c,1,'شروع روشن، انتخاب آگاهانه')
y=heading(c,'هما نت را بشناسید',y)
y=paragraph(c,'هما نت، باشگاه مشتریان مجموعه‌ای در حوزه سفر، صنایع‌دستی، زیبایی و خدمات هوش مصنوعی است. پیش از خرید، مشخصات و شرایط همان محصول یا خدمت را در سایت بررسی کنید.',y)
y=heading(c,'مسیر خرید در چهار گام',y)
for value in ['۱. محصول را در فروشگاه ببینید؛ قیمت ریالی، موجودی و مشخصات را بررسی کنید.','۲. تعداد را انتخاب و محصول را به سبد اضافه کنید؛ مبلغ نهایی را در خلاصه سفارش ببینید.','۳. وارد حساب شوید و اطلاعات لازم برای خرید و ارسال را تکمیل کنید.','۴. پس از پرداخت، نتیجه و وضعیت سفارش را از بخش سفارش‌های حساب پیگیری کنید.']:
    y=paragraph(c,value,y)
y=heading(c,'سفارش و پشتیبانی',y)
y=paragraph(c,'برای پیگیری، بخش سفارش‌ها را باز کنید. اگر پرداخت ناتمام بود، ابتدا نتیجه همان سفارش را بررسی کنید. پرسش‌های خود را از بخش پشتیبانی و تیکت ثبت کنید تا همراه با سوابق خرید پیگیری شوند.',y)
c.linkURL('https://homanets.com/shop',(40,20,170,50),relative=0)
c.showPage();y=page(c,2,'باشگاه، جایگاه‌ها و معرفی')
y=heading(c,'وضعیت جایگاه‌های خود را ببینید',y)
y=paragraph(c,'هر حساب تا هفت جایگاه دارد. در پنل، شماره و وضعیت روشن یا خاموش هر جایگاه نمایش داده می‌شود. وضعیت فعال‌سازی را از حساب خود بخوانید؛ ثبت‌نام یا معرفی به‌تنهایی به معنی فعال شدن همه جایگاه‌ها نیست.',y)
y=heading(c,'شرایط پلن را از سایت بخوانید',y)
y=paragraph(c,'پرزنت آنلاین و بخش کارت‌ها و جایگاه‌ها، مرجع آشنایی با شرایط فعلی باشگاه هستند. پاداش به خرید واجد شرایط، زمان فعال‌سازی، حجم شبکه و محاسبات پلن بستگی دارد. سقف پاداش، موجودی قابل برداشت نیست و درآمد تضمین نمی‌شود.',y)
y=heading(c,'معرفی دقیق و ساده',y)
y=paragraph(c,'از بخش ابزار معرفی، متن آماده یا تصویر معرفی را دریافت کنید. لینک فروشگاه یا پرزنت را متناسب با پرسش مخاطب بفرستید. قیمت، موجودی و شرایط ممکن است تغییر کنند؛ پیش از خرید، صفحه فعلی محصول را بررسی کنید.',y)
y=heading(c,'امنیت حساب',y)
y=paragraph(c,'رمز عبور و کد تأیید را فقط در سایت وارد کنید و در اختیار دیگران نگذارید. برای پرسش یا مشکل، از پشتیبانی داخل حساب استفاده کنید. این راهنما شامل اعداد ثابت پلن نیست؛ وضعیت واقعی شما در پنل نمایش داده می‌شود.',y)
c.setFont('Kit',11);c.drawString(40,85,'https://homanets.com/member-kit');c.linkURL('https://homanets.com/member-kit',(40,70,360,105),relative=0);c.save()
# Native brand graphic, rendered from the same verified fonts and existing logo.
share=Path('/tmp/homa-member-introduction.pdf');c=canvas.Canvas(str(share),pagesize=(432,540))
c.setFillColor(CREAM);c.rect(0,0,432,540,fill=1,stroke=0)
c.setFillColor(TEAL);c.roundRect(28,28,376,484,20,fill=1,stroke=0)
c.drawImage(LOGO,171,414,90,70,mask='auto',preserveAspectRatio=True)
for label,y,size in [('هما نت',385,32),('باشگاه مشتریان',351,15),('یک باشگاه،',286,27),('دنیایی از انتخاب',239,27),('سفر • هنر ایرانی • زیبایی',167,15),('خدمات هوش مصنوعی',138,15)]:text(c,label,360,y,size,CREAM)
c.setStrokeColor(GOLD);c.line(72,204,360,204);c.setFont('Kit',17);c.setFillColor(CREAM);c.drawCentredString(216,83,'homanets.com');c.save()
subprocess.run(['pdftoppm','-png','-singlefile','-scale-to','1350',str(share),str(OUT/'introduction-fa')],check=True)
print('Member guide and portrait image created.')

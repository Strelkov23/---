"""Explicit configuration for the existing pilot loaders.
Adding a source requires a reviewed policy and a source-specific parser.
No discovery of arbitrary URLs; no credentials, automated access workaround,
or implicit rights to retain or redistribute original files.
"""
from dataclasses import dataclass
import re
from source_transport import download,url_allowed

@dataclass(frozen=True)
class Source:
    id:str
    title:str
    hosts:tuple
    path:str
    suffixes:tuple
    format:str
    max_bytes:int
    timeout:int
    adapter:str
    schedule:str
    path_pattern:str=""
    def allowed_path(self,p):
        if self.path_pattern:return bool(re.fullmatch(self.path_pattern,p))
        return p.lower()==self.path.lower() if self.path else p.lower().endswith(self.suffixes)
    def allows(self,url):return url_allowed(url,self.hosts,self.allowed_path)
    def fetch(self,url,**kwargs):
        return download(url,hosts=self.hosts,max_bytes=self.max_bytes,timeout=self.timeout,path_check=self.allowed_path,**kwargs)
    def passport(self):
        return dict(id=self.id,title=self.title,hosts=list(self.hosts),path=self.path or None,suffixes=list(self.suffixes),format=self.format,max_bytes=self.max_bytes,timeout=self.timeout,adapter=self.adapter,schedule=self.schedule,raw_retention="not_enabled",path_pattern=self.path_pattern or None)

CBR=("www.cbr.ru","cbr.ru")
SOURCES={s.id:s for s in (
    Source("cbr_key","ЦБ · ключевая ставка",CBR,"/hd_base/KeyRate/",(),"HTML",6000000,15,"cbr_data.key_rows","При ежедневной сборке"),
    Source("cbr_fx","ЦБ · официальный валютный курс",CBR,"/scripts/XML_dynamic.asp",(),"XML",6000000,15,"cbr_data.fx_rows","При ежедневной сборке"),
    Source("cbr_infl","ЦБ · инфляция и ставка",CBR,"/hd_base/infl/",(),"HTML",8000000,20,"national.parse_infl","При ежедневной сборке"),
    Source("cbr_res","ЦБ · международные резервы",CBR,"/hd_base/mrrf/mrrf_m/",(),"HTML",8000000,20,"national.parse_res","При ежедневной сборке"),
    Source("cbr_money","ЦБ · денежные агрегаты",CBR,"/statistics/macro_itm/dkfs/monetary_agg/",(),"HTML",8000000,20,"national.parse_money","При ежедневной сборке"),
    Source("cbr_money_xlsx","ЦБ · история денежных агрегатов",CBR,"/vfs/statistics/credit_statistics/monetary_agg.xlsx",(),"XLSX",16000000,25,"money_history.parse","При ежедневной сборке"),
    Source("fns_finance","ФНС · отраслевые финансовые таблицы",("data.nalog.ru",),"",(".xls",".xlsx"),"XLS/XLSX",8000000,20,"finance_workbooks.parse","До двух файлов за сборку; 30/7 дней"),
    Source("wdi_series","Всемирный банк · годовые ряды России",("api.worldbank.org",),"",(),"JSON/API",8000000,18,"series.parse_response","При ежедневной сборке",r"/v2/country/RUS/indicator/[A-Za-z0-9_.-]+"),
    Source("wdi_metadata","Всемирный банк · метаданные показателей",("api.worldbank.org",),"/v2/indicator",(),"JSON/API",8000000,20,"wdi_metadata.collect","Раз в 7 дней")
)}

def identify(url):
    matches=[s for s in SOURCES.values() if s.allows(url)]
    if len(matches)!=1:raise ValueError("Неоднозначный или незарегистрированный источник")
    return matches[0]

def fetch(url,**kwargs):return identify(url).fetch(url,**kwargs)
def passports():return [s.passport() for s in SOURCES.values()]

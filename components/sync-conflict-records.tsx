/* eslint-disable @next/next/no-img-element -- Local original photos also work offline. */
import { CATEGORIES,OCCASIONS,SEASONS,referencedAssets,type ClosetRecord } from "@/lib/domain";
import { assetUrl } from "@/lib/profile-client";
import { useI18n } from "@/lib/i18n/provider";
const labels:Record<string,string>={name:'名称',brand:'品牌',purchasePrice:'购买价格',category:'分类',color:'颜色',colorStyle:'配色',mode:'模式',values:'颜色',hex:'色值',seasons:'季节',occasions:'场合',notes:'备注',archived:'已收起',fit:'版型',shoeFit:'合脚程度',shoeSize:'鞋码',eu:'欧码',cn:'中国码（mm）',measurements:'尺寸（cm）',shoulderWidth:'肩宽',chest:'胸围',waist:'腰围',hips:'臀围',thigh:'大腿围',knee:'膝围',legOpening:'裤脚围',length:'长度',sleeveLength:'袖长',rise:'前裆长',hem:'下摆围',height:'身高',armLength:'臂长',inseam:'内腿长',outseam:'外腿长',footLength:'脚长',itemIds:'搭配单品',memberIds:'分组成员',parentId:'上级分组',scope:'分组范围',root:'所属分类',date:'日期',status:'状态',outfitId:'搭配',snapshot:'当时的搭配快照',items:'当时的单品',data:'详情'};
const values:Record<string,string>={...CATEGORIES,...OCCASIONS,...SEASONS,item:'单品',outfit:'搭配',calendar:'日历',subset:'分组',personalSizes:'我的尺码',all:'全部',planned:'计划穿',worn:'已穿',solid:'纯色',primary:'主色加辅色',colorblock:'拼色',tight:'紧身',fitted:'修身',regular:'常规',loose:'宽松',trueToSize:'合脚',large:'偏大',small:'偏小'};
export function SyncConflictRecords({records,owner}:{records:ClosetRecord[];owner:string}){
  const {t}=useI18n();const names=new Map(records.map(r=>[r.id,'name' in r.data?r.data.name:values[r.kind]]));
  function describe(value:unknown,key=''):React.ReactNode {
    if(value===null||value===undefined||value==='')return t('未填写');
    if(typeof value==='boolean')return value?t('是'):t('否');
    if(Array.isArray(value))return value.length?<div>{value.map((v,i)=><div key={i}>{describe(v,key)}</div>)}</div>:t('无');
    if(typeof value==='object')return <dl className="sync-fields">{Object.entries(value).filter(([k])=>!['id','asset','photos'].includes(k)).map(([k,v])=><div key={k}><dt>{t(labels[k]||k)}</dt><dd>{describe(v,k)}</dd></div>)}</dl>;
    if(typeof value==='string')return names.get(value)||t(values[value]||value);
    return String(value);
  }
  if(!records.length)return <p>{t('已删除')}</p>;
  return <div>{records.map(record=><article key={record.id}><h4>{t(values[record.kind])} · {'name' in record.data?record.data.name:''}</h4><div className="sync-photo-strip">{[...referencedAssets([record])].map(hash=><img key={hash} src={assetUrl(hash,owner)} alt={t('原图预览')}/>)}</div>{describe(record.data)}</article>)}</div>;
}

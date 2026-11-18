'use client';
// Tiny hooks shared by the dashboard; large message/visitor panels stay lazy.
import {useEffect,useState} from 'react';
import {canBackgroundRefresh} from '../lib/refresh-activity';
import {readApiResponse} from '../lib/client-api';

export function useMessageCount(){const [count,setCount]=useState(0);useEffect(()=>{let live=true;const load=async()=>{try{const r=await fetch('/api/messages?count=1',{cache:'no-store'});if(r.ok){const v:any=await readApiResponse(r);if(live)setCount(v.counts?.new||0);}}catch{}};load();const t=setInterval(()=>{if(canBackgroundRefresh())load();},30000);return()=>{live=false;clearInterval(t);};},[]);return count;}

export function useVisitorCount(){const [count,setCount]=useState(0);useEffect(()=>{let live=true;async function load(){try{const r=await fetch('/api/visitors?count=1',{cache:'no-store'});if(r.ok){const v:any=await readApiResponse(r);if(live)setCount(v.waiting||0);}}catch{}}load();const t=setInterval(()=>{if(canBackgroundRefresh())load();},15000);return()=>{live=false;clearInterval(t);};},[]);return count;}

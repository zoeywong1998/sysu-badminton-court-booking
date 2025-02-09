// ==UserScript==
// @name         中大东校羽毛球场地极简预定
// @namespace    badminton.sysu.andiedie
// @author       Andiedie
// @license      MIT License
// @homepageURL  https://github.com/Andiedie/sysu-badminton-court-booking
// @match        http://26501.koksoft.com/weixinordernewv7.aspx?wxkey=153DC84BBF7CABBB49618F7ED48D5A310A30AB1DF70AD3A9C684B7D4A018327027A187B6516EAE341407FD205801D027E09935A390E4E33B406AE41A45CA1E6D5B3FA17DA63D39BCDBFF86F8FDADE4C8E0541BE69F204236CF3D90EB60E7A8BC8138F8F8A742C49C0C43F117B3D93577&lxbh=A&orderdate=2022-05-17
// @description  中大东校羽毛球场地极简预定
// @version      0.3.2
// @grant        none
// @require      https://cdn.bootcss.com/axios/0.18.0/axios.min.js
// @require      https://cdn.bootcss.com/date-fns/123/date_fns.min.js
// ==/UserScript==

(async function () {
  'use strict';

  const button = document.createElement('a');
  button.textContent = '自动预定';
  document.querySelector('div.switch.simple-lines div.boxes').appendChild(button);
  const wrapper = document.createElement('div');
  wrapper.style = `
    position: fixed;
    top: 0;
    left: 0;
  `;
  document.body.appendChild(wrapper);

  // 确认目标日期是否开放预定
  const checkAvailable = async dateString => {
    const { data } = await axios.get('/product/show.html?id=35');
    const result = data.match(/<div class="date">(\d+-\d+-\d+)<\/div>/g);
    return result.includes(`<div class="date">${dateString}</div>`);
  };

  // 确认登录状态
  const checkLogin = async () => {
    const { data } = await axios.get('/product/show.html?id=35');
    return data.includes('安全退出');
  };

  button.onclick = async () => {
    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
    if (await checkLogin() === false) {
      alert('请先登录');
      return;
    }
    // 确认预订信息
    // dayOffset：预定日距离今天还有多少天
    const dayOffset = prompt('预定哪天的？\n0 for today.\n1 for tomorrow\netc.', 1);
    if (dayOffset === null) return;
    // targetDate：预定日
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Number(dayOffset));
    // formatedDate：格式化文本
    const formatedDate = dateFns.format(targetDate, 'YYYY-MM-DD');

    // 获取可供预订的时间
    const { data } = await axios.get('/product/getarea2.html', {
      params: {
        s_dates: formatedDate,
        serviceid: '35',
        type: 'day'
      }
    });
    const availableTime = data.timeList.map(obj => obj.TIME_NO);

    // targetIndecies：预定时间的index
    const targetIndecies = prompt(`预定几点的？${availableTime.reduce((prev, cur, index) => `${prev}\n${index} for ${cur}`, '')}\n多个时间段逗号隔开`, '0,1,2,3');
    if (targetIndecies === null) return;

    // targetList：预定时间列表
    const targetList = [];
    targetIndecies.split(',').forEach(index => targetList.push({
      time: availableTime[index],
      done: false,
      ele: null
    }));

    // 询问用户是否确认
    if (!confirm(`确定要预定\n${formatedDate}${targetList.reduce((prev, cur) => `${prev}\n${cur.time}`, '')}\n的羽毛球场地吗？`)) return;

    let isDateAvailable = await checkAvailable(formatedDate);
    if (!isDateAvailable) alert(`你选择的日期 ${formatedDate} 还未开始预定\n脚本将在开始时自动运行`);

    // UI
    for (const target of targetList) {
      const link = document.createElement('a');
      link.style = `
        display: block;
        background-color: white;
      `;
      link.target = '_blank';
      link.href = '#';
      link.textContent = `${target.time} ${isDateAvailable ? '正在预定' : '等待开始'}`;
      wrapper.appendChild(link);
      target.ele = link;
    }

    // 等待开始
    while (!isDateAvailable) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        isDateAvailable = await checkAvailable(formatedDate);
      } catch (err) {
        console.log(err.message);
      }
    }

    for (const target of targetList) {
      target.ele.textContent = `${target.time} 正在预定`;
    }

    // 开始轮询
    while (targetList.find(val => !val.done)) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 获取预定日的所有可用场地
      let data;
      try {
        ({ data } = await axios.get('/product/findOkArea.html', {
          params: {
            s_date: formatedDate,
            serviceid: '35'
          }
        }));
      } catch (err) {
        console.log(err.message);
      }
      if (!data.object) continue;

      // 符合条件且可以提交申请的场地列表
      const taskList = [];
      // 对于每个未完成的需求
      for (const target of targetList.filter(val => !val.done)) {
        // 筛选出符合时间要求的场地
        const satisfied = data.object.filter(val => val.stock.time_no === target.time);
        if (satisfied.length === 0) continue;
        // 选出第一个位置在中间的球场
        // 没有的话就随便选一个
        const court = satisfied.find(val => Number(val.name) % 5 > 1) || satisfied[0];
        // 避免同一个场地被多个任务选中
        court.stock.time_no = '';
        taskList.push({
          id: court.id,
          stockid: court.stockid,
          name: court.name,
          target
        });
      }

      // 如果有可以预定的场
      for (const task of taskList) {
        const formData = new FormData();
        formData.append('param', `{"activityPrice":0,"activityStr":null,"address":null,"dates":null,"extend":null,"flag":"0","isbookall":"0","isfreeman":"0","istimes":"1","merccode":null,"order":null,"orderfrom":null,"remark":null,"serviceid":null,"shoppingcart":"0","sno":null,"stock":{"${task.stockid}":"1"},"stockdetail":{"${task.stockid}":"${task.id}"},"stockdetailids":"${task.id}","subscriber":"0","time_detailnames":null,"userBean":null}`);
        formData.append('json', 'true');
        const { data } = await axios.post('/order/book.html', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        if (data.message === '未支付') {
          task.target.done = true;
          task.target.ele.href = `/order/myorder_view.html?id=${data.object.orderid}`;
          task.target.ele.textContent = `${task.target.time} ${task.name}号场 √ 点击付款`;
        }
      }
    }
    alert('全部预定已经完成');
  };
})();

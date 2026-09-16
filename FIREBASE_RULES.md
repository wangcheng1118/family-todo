# Firebase Realtime Database 安全规则

> ⚠️ 这是必做项。未配置规则前,**任何人都能读取和修改你 Firebase 项目里的所有房间数据**,
> 且恶意脚本可以批量枚举房间号(16位 hex ≈ 128 bit 熵,暴力枚举不可行,但你不能假设
> 所有旧/弱随机生成器生成的房间号都安全)。

## 当前问题(修复前)

- 默认规则 `true` —— 任何人可以读写全库
- 攻击者可读/写任意房间
- 攻击者可以推送极大 payload 把数据库撑爆

## 修复方法

### 1. 进入 Firebase 控制台

打开 https://console.firebase.google.com/

进入你的项目 `family-todo-5768a`

### 2. 进入 Rules 面板

左侧菜单 → **Realtime Database** → 顶部 **Rules** 选项卡

### 3. 替换规则

把控制台编辑器里的内容**全部删除**,然后粘贴 `database.rules.json` 文件的内容:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": "(!data.exists() || data.child('updatedAt').val() <= newData.child('updatedAt').val()) &&
                   newData.hasChildren(['lists', 'updatedAt']) &&
                   newData.child('updatedAt').isNumber() &&
                   newData.child('lists').hasChildren() &&
                   newData.val().length < 100000",
        "members": {
          "$memberId": {
            ".validate": "newData.hasChildren(['id', 'name'])"
          }
        }
      }
    }
  }
}
```

### 4. 发布

点右上角 **Publish** 按钮 → 等待 1-2 分钟生效。

## 规则做了什么

| 规则 | 作用 |
|---|---|
| `.read: true` | 任何人能读(房间号是共享密钥) |
| `!data.exists() \|\| data... <= newData...` | **updatedAt 必须单调递增**,不能用旧时间戳覆盖新数据 |
| `newData.hasChildren(['lists', 'updatedAt'])` | 必须有完整的两个根字段 |
| `newData.child('updatedAt').isNumber()` | updatedAt 必须是数字(防止字符串注入) |
| `newData.child('lists').hasChildren()` | lists 不能为空(防止清空数据) |
| `newData.val().length < 100000` | payload 大小限制,防止 DoS |
| `members.$id` validate | 成员对象必须有 id 和 name |

## 验证规则

发布后,试着在浏览器控制台(F12)执行:

```js
// 测试 1: 应该失败(updatedAt 没递增,试图用旧时间戳覆盖)
firebase.database().ref('rooms/你的房间号').set({
  updatedAt: 1,  // 故意很小
  lists: { foo: { id: 'foo', name: 'hacked', todos: [], members: [] } }
});
// 应该返回 PERMISSION_DENIED

// 测试 2: 应该成功(正常推进时间戳)
firebase.database().ref('rooms/你的房间号').set({
  updatedAt: Date.now(),
  lists: { foo: { id: 'foo', name: 'test', todos: [], members: [] } }
});
// 应该成功

// 测试 3: 应该失败(没有 lists)
firebase.database().ref('rooms/你的房间号').set({
  updatedAt: Date.now()
});
// 应该返回 PERMISSION_DENIED
```

如果三个测试结果一致,规则就生效了。

## 进一步加固(可选)

如果想要更强保护,可以加**身份认证**(Firebase Auth),让每个用户登录后才能读写。
但对本项目"家庭自用"的定位来说,房间号+上述规则已经足够。
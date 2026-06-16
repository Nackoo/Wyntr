<img src="https://wyntr.netlify.app/image/w.png" height="200"></img>

<h1>Wyntr</h1>

## netlify .env

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1423693997813268500/e-0SOE1JlwsjqHtT3XxV5HSeEHGg8UC8JEIqIX802V08MNVLEf8jjFgGJEQMF7OhWfo-
DISCORD_WEBHOOK_URL_1=https://discord.com/api/webhooks/1423705843672547468/sJkRUT1sjoEdo0fYjo0uptcwXRXbuCMuipiyF8SNzTR9PP0RO9mMKtxcraDU6g3O6Rq8
```

## Firestore rules

read [Firestore rules](/firestore_rules.txt)

## firestore indexes

| Collection ID | Fields indexed                                               | Query scope  |
|---------------|--------------------------------------------------------------|--------------|
| comments      | `parentId ↑`, `likeCount ↓`, `createdAt ↓`, `__name__ ↓`     | Collection   |
| comments      | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| comments      | `parentId ↑`, `uid ↑`, `__name__ ↑`                          | Collection   |
| comments      | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`                   | Collection   |
| comments      | `searchTokens []`. `parentId ↑`, `createdAt ↓`, `__name__ ↓` | Collection   |
| communities   | `lowerCase ↑`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| communities   | `members []`, `lastActivity ↓`, `__name__ ↓`                 | Collection   |
| communities   | `members []`, `lowerCase ↑`, `__name__ ↑`                    | Collection   |
| posts         | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| posts         | `retweetOf ↑`, `likeCount ↓`, `__name__ ↓`                   | Collection   |
| posts         | `retweetOfComment.commentId ↑`, `likeCount ↓`, `__name__ ↓`  | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                         | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| tweets        | `retweetOf ↑`, `likeCount ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `retweetOfComment.commentId ↑`, `likeCount ↓`, `__name__ ↓`  | Collection   |

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_delete | anon         | `(bucket_id = 'wints'::text)` |

<hr>

Created by Nackoo

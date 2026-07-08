<img src="https://wyntr.netlify.app/image/w.png" height="200"></img>

<h1>Wyntr</h1>

## netlify .env

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_FOR_ADMIN_ACTIONS_URL
DISCORD_WEBHOOK_URL_1=https://discord.com/api/webhooks/WEBHOOK_FOR_REPORTS_URL
```

## Firestore rules

read [Firestore rules](/firestore_rules.txt)

## firestore indexes

| Collection ID | Fields indexed                                                            | Query scope |
|---------------|---------------------------------------------------------------------------|-------------|
| comments      | `parentId ↑`, `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                  | Collection  |
| comments      | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                                | Collection  |
| comments      | `parentId ↑`, `uid ↑`, `__name__ ↑`                                       | Collection  |
| comments      | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`                                | Collection  |
| comments      | `searchTokens []`. `parentId ↑`, `createdAt ↓`, `__name__ ↓`              | Collection  |
| communities   | `lowerCase ↑`, `createdAt ↓`, `__name__ ↓`                                | Collection  |
| communities   | `members []`, `lastActivity ↓`, `__name__ ↓`                              | Collection  |
| communities   | `members []`, `lowerCase ↑`, `__name__ ↑`                                 | Collection  |
| communities   | `membersCount ↓`, `private ↓`, `__name__ ↓`                               | Collection  |
| communities   | `lowerCase ↑`, `private ↑`, `__name__ ↑`                                  | Collection  |
| communities   | `members []`, `private ↑`, `__name__ ↑`                                   | Collection  |
| communities   | `members []`, `lowerCase ↑`, `private ↑`, `__name__ ↑`                    | Collection  |
| posts         | `searchTokens []`, `createdAt ↓`, `archived ↓`, `__name__ ↓`              | Collection  |
| posts         | `createdAt ↓`, `archived ↓`, `__name__ ↓`                                 | Collection  |
| posts         | `archived ↑`, `uid ↑`, `createdAt ↓`, `__name__ ↓`                        | Collection  |
| posts         | `retweetOf ↑`, `likeCount ↓`, `archived ↓`, `__name__ ↓`                  | Collection  |
| posts         | `searchTokens []`, `archived ↑`, `createdAt ↓`, `__name__ ↓`              | Collection  |
| posts         | `retweetOfComment.commentId ↑`, `likeCount ↓`, `archived ↓`, `__name__ ↓` | Collection  |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                                      | Collection  |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                                | Collection  |
| tweets        | `searchTokens []`, `createdAt ↓`, `archived ↓`, `__name__ ↓`              | Collection  |
| tweets        | `retweetOf ↑`, `likeCount ↓`, `archived ↓`, `__name__ ↓`                  | Collection  |
| tweets        | `retweetOfComment.commentId ↑`, `likeCount ↓`, `archived ↓`, `__name__ ↓` | Collection  |
| tweets        | `mentioned []`, `createdAt ↓`, `__name__ ↓`                               | Collection  |
| tweets        | `createdAt ↓`, `archived ↓`, `__name__ ↓`                                 | Collection  |
| tweets        | `archived ↑`, `createdAt ↓`, `__name__ ↓`                                 | Collection  |
| tweets        | `uid ↑`, `createdAt ↓`, `archived ↓`, `__name__ ↓`                        | Collection  |
| tweets        | `mentioned []`, `createdAt ↓`, `archived ↓`, `__name__ ↓`                 | Collection  |
| tweets        | `searchTokens []`, `archived ↑`, `createdAt ↓`, `__name__ ↓`              | Collection  |
| tweets        | `mentionedSearchTokens []`, `createdAt ↓`, `archived ↓`, `__name__ ↓`     | Collection  |
| tweets        | `tags []`, `createdAt ↓`, `archived ↓`, `__name__ ↓`                      | Collection  |
| likes         | `followers ↓`, `status ↓`, `__name__ ↓`                                   | Collection  |
| likes         | `followers ↓`, `name ↓`, `status ↓`, `__name__ ↓`                         | Collection  |
| likes         | `followers ↓`, `status ↓`, `username ↓`, `__name__ ↓`                     | Collection  |
| members       | `role ↓`, `contributions ↓`, `__name__ ↓`                                 | Collection  |
| members       | `role ↓`, `contributions ↓`, `status ↓`, `__name__ ↓`                     | Collection  |
| members       | `name ↑`, `status ↑`, `__name__ ↑`                                        | Collection  |
| members       | `status ↑`, `username ↑`, `__name__ ↑`                                    | Collection  |
| views         | `followers ↓`, `status ↓`, `__name__ ↓`                                   | Collection  |
| views         | `followers ↓`, `name ↓`, `status ↓`, `__name__ ↓`                         | Collection  |
| views         | `followers ↓`, `status ↓`, `username ↓`, `__name__ ↓`                     | Collection  |
| followers     | `followersCount ↓`, `name ↓`, `status ↓`, `__name__ ↓`                    | Collection  |
| followers     | `followersCount ↓`, `username ↓`, `__name__ ↓`                            | Collection  |
| followers     | `followersCount ↓`, `status ↓`, `username ↓`, `__name__ ↓`                | Collection  |
| followers     | `followersCount ↓`, `name ↓`, `__name__ ↓`                                | Collection  |
| followers     | `followersCount ↓`, `status ↓`, `__name__ ↓`                              | Collection  |
| following     | `followersCount ↓`, `name ↓`, `status ↓`, `__name__ ↓`                    | Collection  |
| following     | `followersCount ↓`, `status ↓`, `__name__ ↓`                              | Collection  |
| following     | `followersCount ↓`, `status ↓`, `username ↓`, `__name__ ↓`                | Collection  |
| following     | `followersCount ↓`, `username ↓`, `__name__ ↓`                            | Collection  |
| following     | `followersCount ↓`, `name ↓`, `__name__ ↓`                                | Collection  |
| contributors  | `contributions ↓`, `name ↓`, `__name__ ↓`                                 | Collection  |
| contributors  | `contributions ↓`, `username ↓`, `__name__ ↓`                             | Collection  |

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_delete | anon         | `(bucket_id = 'wints'::text)` |

<hr>

Created by Nackoo

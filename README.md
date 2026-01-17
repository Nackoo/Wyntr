<img src="https://wyntr.netlify.app/image/w.png" height="200"></img>

<h1>Wyntr</h1>

## firestore indexes

| Collection ID | Fields indexed                                               | Query scope  |
|---------------|--------------------------------------------------------------|--------------|
| comments      | `likeCount ↑`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                         | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`                   | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| posts         | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| comments      | `parentId ↑`, `likeCount ↓`, `createdAt ↓`, `__name__ ↓`     | Collection   |
| comments      | `searchTokens []`, `parentId ↑`, `createdAt ↓`, `__name__ ↓` | Collection   |

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_delete | anon         | `(bucket_id = 'wints'::text)` |

<hr>

Created by Nackoo

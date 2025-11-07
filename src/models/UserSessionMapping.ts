import { Entity, PrimaryGeneratedColumn, Column, OneToMany,CreateDateColumn,UpdateDateColumn } from 'typeorm';
// TypeORM 实体定义
@Entity({ name: 'user_session_mapping' })
export class UserSessionMapping {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ type: 'varchar', length: 255 })
  user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  thread_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;
}
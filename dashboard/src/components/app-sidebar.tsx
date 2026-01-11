import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CreditCard, Gavel, Globe, History, Layers, Settings, Shield, Star } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from './ui/sidebar'

import { useAuth } from '../providers/auth'

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

type NavItem = {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  items?: Array<{ title: string; url: string }>
}

export function AppSidebar(): JSX.Element {
  const { pathname } = useLocation()
  const { user } = useAuth()

  const showBilling = user?.role !== 'admin'

  const navMain: NavItem[] = [
    {
      title: 'Auctions',
      url: '/auctions',
      icon: Gavel,
      items: [
        { title: 'Eras', url: '/auctions/era' },
        { title: 'Languages', url: '/auctions/language' }
      ]
    }
  ]

  const navOther: NavItem[] = [
    { title: 'Eras', url: '/era', icon: Layers },
    { title: 'Settings', url: '/settings', icon: Settings }
  ]

  const navAdmin: NavItem[] = user?.role === 'admin'
    ? [
        {
          title: 'Admin',
          url: '/admin',
          icon: Shield,
          items: [{ title: 'Auction Imports', url: '/admin/imports' }]
        }
      ]
    : []

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>

          <SidebarMenu>
            {/* Main section with submenu like shadcn block */}
            {navMain.map((item) => {
              const Icon = item.icon
              const groupActive = isActive(pathname, item.url)

              return (
                <SidebarMenuItem key={item.title}>
                  {/* Top-level button is a link (like shadcn sample) */}
                  <SidebarMenuButton asChild tooltip={item.title} isActive={groupActive}>
                    <Link to={item.url} className="font-medium">
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>

                  {/* Submenu */}
                  {item.items?.length ? (
                    <SidebarMenuSub>
                      {item.items.map((sub) => {
                        const subActive = isActive(pathname, sub.url)
                        const SubIcon =
                          sub.url === '/auctions/era'
                            ? Star
                            : sub.url === '/auctions/language'
                              ? Globe
                              : null

                        return (
                          <SidebarMenuSubItem key={sub.title}>
                            <SidebarMenuSubButton asChild isActive={subActive}>
                              <Link to={sub.url}>
                                {SubIcon ? <SubIcon className="mr-2 h-4 w-4" /> : null}
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              )
            })}

            {/* Other single links */}
            {navOther.map((item) => {
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={isActive(pathname, item.url)}>
                    <Link to={item.url}>
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}

            {/* Admin */}
            {navAdmin.map((item) => {
              const Icon = item.icon
              const groupActive = isActive(pathname, item.url)

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={groupActive}>
                    <Link to={item.url} className="font-medium">
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>

                  {item.items?.length ? (
                    <SidebarMenuSub>
                      {item.items.map((sub) => {
                        const subActive = isActive(pathname, sub.url)
                        const SubIcon =
                          sub.url === '/auctions/era'
                            ? Star
                            : sub.url === '/auctions/language'
                              ? Globe
                              : sub.url === '/admin/imports'
                                ? History
                                : null

                        return (
                          <SidebarMenuSubItem key={sub.title}>
                            <SidebarMenuSubButton asChild isActive={subActive}>
                              <Link to={sub.url}>
                                {SubIcon ? <SubIcon className="mr-2 h-4 w-4" /> : null}
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              )
            })}

            {/* Billing */}
            {showBilling ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Billing" isActive={isActive(pathname, '/billing')}>
                  <Link to="/billing">
                    <CreditCard className="h-4 w-4" />
                    <span>Billing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
